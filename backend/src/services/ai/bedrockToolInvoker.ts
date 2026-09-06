import { BedrockRuntimeClient, ConverseCommand, type Message } from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { AiFatalError, AiInvocationError, AiResponseInvalidError } from "./errors.js";

/**
 * Bedrock Converse API(Tool use)呼び出しの共通ロジック。
 * Vision(画像+テキスト)・Receipt/Voice(テキストのみ)のどのAdapterも
 * 同じリトライ・タイムアウト予算・エラー分類を必要とするため、ここに一本化する
 * (以前はBedrockVisionAdapter.ts内に直書きされていて、レシート/音声Adapter追加時に
 * そのままコピーすると同じロジックが3箇所に増えてしまうところだった)。
 */
const client = new BedrockRuntimeClient({});

// コスト最優先のためデフォルトは軽量マルチモーダルモデル(Amazon Nova Lite)。
const MODEL_ID = config.bedrockModelId;

export const MAX_RETRIES = 3;
export const INVOKE_TIMEOUT_MS = 15_000;

/**
 * リトライ全体(Bedrock呼び出し部分だけ)にかけてよい時間の上限。
 * Analyzer WorkerのLambdaタイムアウトは60秒(infra/lambda.tf の
 * aws_lambda_function.worker.timeout)なので、OCR/Transcribe・食材マスター解決・
 * DynamoDB書き込み分の余裕を差し引いた45秒とする。
 */
export const OVERALL_BUDGET_MS = 45_000;

/** infra/lambda.tf の aws_lambda_function.worker.timeout と一致させること。 */
export const WORKER_LAMBDA_TIMEOUT_MS = 60_000;

/**
 * リクエスト内容そのものが原因のエラー(権限不足・入力不正・モデル/リソース不在)は
 * 何度リトライしても同じ結果にしかならないため、即座に諦めてリトライ回数を消費しない。
 * それ以外(スロットリング・タイムアウト・一時的なサービス障害等)は指数バックオフで再試行する。
 */
const NON_RETRYABLE_ERROR_NAMES = new Set([
  "AccessDeniedException",
  "ValidationException",
  "ResourceNotFoundException",
  "UnrecognizedClientException",
]);

export function isRetryableError(err: unknown): boolean {
  const name = (err as { name?: unknown })?.name;
  if (typeof name !== "string") return true; // 未知の形のエラー(ネットワーク断等)は念のため再試行する
  return !NON_RETRYABLE_ERROR_NAMES.has(name);
}

/**
 * Bedrockの日次トークンクォータ超過は `ThrottlingException` として返ってくるため
 * 例外名だけでは秒間の一過性スロットリングと区別できない。メッセージ文言
 * ("Too many tokens per day, please wait before trying again.")で判定する。
 * このクォータは翌日まで回復しないため、指数バックオフでリトライしても無意味であり、
 * リトライを重ねるほど(1回のS3イベントに対しLambda内3回×SQS再配信3回=最大9回)
 * 既に枯渇しているクォータをさらに消費してしまう。そのため他のThrottlingExceptionとは
 * 区別し、ローカルリトライすらせず即座に致命的エラーとして扱う。
 */
function isDailyTokenQuotaExceeded(err: unknown): boolean {
  const message = (err as { message?: unknown })?.message;
  return typeof message === "string" && /too many tokens per day/i.test(message);
}

/**
 * 「リトライしても絶対に成功しない」と判定できるエラーについて、
 * ImageAnalysis/VoiceAnalysisのerrorReasonに記録する理由文字列を返す。
 * 該当しない(=リトライする価値がある)場合はnullを返す。
 */
function fatalReasonFor(err: unknown): string | null {
  if (isDailyTokenQuotaExceeded(err)) return "bedrock_quota_exceeded";
  if (isRetryableError(err)) return null;

  const name = (err as { name?: unknown })?.name;
  switch (name) {
    case "AccessDeniedException":
      return "bedrock_access_denied";
    case "ValidationException":
      return "bedrock_validation_error";
    case "ResourceNotFoundException":
      return "bedrock_resource_not_found";
    case "UnrecognizedClientException":
      return "bedrock_unrecognized_client";
    default:
      // NON_RETRYABLE_ERROR_NAMESに名前を足したが上のswitchを更新し忘れた場合の保険。
      return "bedrock_non_retryable";
  }
}

export function mediaFormatFromContentType(contentType: string): "jpeg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpeg";
}

export async function invokeBedrockTool<T>(params: {
  systemPrompt: string;
  userText: string;
  /** 画像を伴う解析(Vision)の場合のみ指定。レシート/音声のテキスト解析では省略する。 */
  image?: { base64: string; contentType: string };
  toolName: string;
  toolDescription: string;
  jsonSchema: Record<string, unknown>;
  parse: (raw: unknown) => T;
}): Promise<T> {
  const content: NonNullable<Message["content"]> = [{ text: params.userText }];
  if (params.image) {
    content.push({
      image: {
        format: mediaFormatFromContentType(params.image.contentType),
        source: { bytes: Buffer.from(params.image.base64, "base64") },
      },
    });
  }
  const messages: Message[] = [{ role: "user", content }];

  const log = logger.child({ component: "bedrockToolInvoker", toolName: params.toolName, modelId: MODEL_ID });
  const overallStart = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (Date.now() - overallStart >= OVERALL_BUDGET_MS) {
      // 次の試行を始めると全体の時間予算を超える(≒呼び出し元のLambdaタイムアウトに
      // 近づきすぎる)ため、新たな試行は始めずここで打ち切る。
      log.error("bedrock_invocation_budget_exceeded", { attempt: attempt - 1, budgetMs: OVERALL_BUDGET_MS });
      throw new AiInvocationError(
        `Bedrock invocation aborted after ${attempt - 1} attempt(s): exceeded overall time budget of ${OVERALL_BUDGET_MS}ms`,
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
    const attemptStart = Date.now();
    try {
      const res = await client.send(
        new ConverseCommand({
          modelId: MODEL_ID,
          system: [{ text: params.systemPrompt }],
          messages,
          toolConfig: {
            tools: [
              {
                toolSpec: {
                  name: params.toolName,
                  description: params.toolDescription,
                  inputSchema: { json: params.jsonSchema as DocumentType },
                },
              },
            ],
            toolChoice: { tool: { name: params.toolName } },
          },
          inferenceConfig: { maxTokens: 1024, temperature: 0 },
        }),
        { abortSignal: controller.signal },
      );

      const toolUseBlock = res.output?.message?.content?.find((c) => c.toolUse)?.toolUse;
      if (!toolUseBlock?.input) {
        log.error("bedrock_response_missing_tool_use", { attempt, durationMs: Date.now() - attemptStart });
        throw new AiResponseInvalidError("no tool_use block returned by model", res);
      }
      log.info("bedrock_invocation_succeeded", {
        attempt,
        durationMs: Date.now() - attemptStart,
        inputTokens: res.usage?.inputTokens,
        outputTokens: res.usage?.outputTokens,
        stopReason: res.stopReason,
      });
      return params.parse(toolUseBlock.input);
    } catch (err) {
      if (err instanceof AiResponseInvalidError) throw err;
      lastError = err;

      const fatalReason = fatalReasonFor(err);
      if (fatalReason) {
        log.error("bedrock_invocation_fatal", {
          attempt,
          durationMs: Date.now() - attemptStart,
          reason: fatalReason,
          err,
        });
        throw new AiFatalError(`Bedrock invocation failed fatally (${fatalReason}): ${String(err)}`, fatalReason);
      }

      const backoffMs = 300 * 2 ** (attempt - 1);
      log.warn("bedrock_invocation_retrying", {
        attempt,
        maxRetries: MAX_RETRIES,
        durationMs: Date.now() - attemptStart,
        backoffMs,
        err,
      });
      // 指数バックオフで再試行(Bedrockの一過性スロットリング/タイムアウト対策)
      await new Promise((r) => setTimeout(r, backoffMs));
    } finally {
      clearTimeout(timeout);
    }
  }
  log.error("bedrock_invocation_exhausted", { attempts: MAX_RETRIES, err: lastError });
  throw new AiInvocationError(`Bedrock invocation failed after ${MAX_RETRIES} attempts: ${String(lastError)}`);
}
