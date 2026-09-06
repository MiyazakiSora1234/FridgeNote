/**
 * 構造化ログ基盤。
 *
 * 背景: 以前は各所が `console.log("メッセージ", 値1, 値2)` のように自由形式で
 * ログを出しており、CloudWatch Logs Insightsで「特定のanalysisIdの一連の処理を追う」
 * 「エラー理由(errorReason)ごとに件数を集計する」といったクエリが書きづらかった。
 * ここでは1行=1つのJSONオブジェクトという構造化ログに統一し、API Lambda・
 * Analyzer Worker Lambdaの両方から同じ形で使えるようにする。
 *
 * 設計方針:
 * - 依存ライブラリを増やさない(Lambdaのコールドスタート・バンドルサイズへの影響を避ける)。
 *   Lambdaランタイムは stdout/stderr をそのままCloudWatch Logsへ転送するため、
 *   JSON.stringifyしたテキストを1行출力するだけで十分。
 * - `logger.child({ analysisId, userId, ... })` で文脈を束縛した子ロガーを作れるようにし、
 *   1つの解析ジョブに関する全ログ行に共通のフィールドが自動的に付くようにする
 *   (呼び出しのたびに同じフィールドを書く手間・書き漏れを防ぐ)。
 * - ログレベルは `LOG_LEVEL` 環境変数(Terraform経由でLambdaに設定)で絞り込めるようにし、
 *   障害調査時に再デプロイなしで詳細ログ(debug)へ切り替えられるようにする。
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

/**
 * Errorインスタンス(および `reason`/`raw` のような、このリポジトリ独自のカスタムエラーが
 * 持つ追加プロパティ)をログに残せる形へ変換する。生の Error を JSON.stringify すると
 * `{}` になってしまう(message/stackは列挙可能プロパティではないため)ことへの対処。
 */
function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const extra: LogFields = {};
    // AiFatalError.reason / AiResponseInvalidError.raw など、エラーサブクラスが
    // 独自に持たせている診断用フィールドを可能な範囲で拾う。
    for (const key of ["reason", "raw", "status", "code"] as const) {
      if (key in err) extra[key] = (err as unknown as LogFields)[key];
    }
    return { name: err.name, message: err.message, stack: err.stack, ...extra };
  }
  return { value: err };
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields & { err?: unknown }): void;
  error(message: string, fields?: LogFields & { err?: unknown }): void;
  /** 以後このロガーから出すログ全てに、指定したフィールドを自動で付与する子ロガーを作る。 */
  child(bindings: LogFields): Logger;
}

function createLogger(base: LogFields): Logger {
  const minLevel = resolveMinLevel();

  function write(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const { err, ...rest } = fields as LogFields & { err?: unknown };
    const entry: LogFields = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...base,
      ...rest,
    };
    if (err !== undefined) entry.error = serializeError(err);

    const line = JSON.stringify(entry);
    // warn/errorはCloudWatch上でも区別しやすいようstderrへ、それ以外はstdoutへ出す
    // (Lambdaランタイムはどちらも同じロググループに取り込むため機能上の差はない)。
    if (level === "warn" || level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (bindings) => createLogger({ ...base, ...bindings }),
  };
}

/**
 * ルートロガー。`AWS_LAMBDA_FUNCTION_NAME` はLambdaランタイムが自動的に設定するため、
 * 呼び出し側が明示しなくてもどちらのLambda(api/worker)のログかがログ行から分かる。
 */
export const logger = createLogger({
  functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
});
