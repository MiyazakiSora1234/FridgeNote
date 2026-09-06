/**
 * AI Adapter層(Vision/OCR/Transcription/Receipt/Voice)共通のエラー型。
 * 個別のAdapterファイルに重複定義しないよう、ここに集約する。
 */
export class AiResponseInvalidError extends Error {
  constructor(
    message: string,
    public raw: unknown,
  ) {
    super(message);
    // Errorを継承しただけでは name は常に"Error"のままになる(JSの既知の挙動)。
    // ログにerrを渡した際にどの種類のエラーか一目で分かるよう、明示的に設定する。
    this.name = "AiResponseInvalidError";
  }
}

export class AiInvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInvocationError";
  }
}

/**
 * 権限不足・入力不正・モデル/リソース不整合・日次トークンクォータ超過など、
 * 「リトライしても絶対に成功しない」と判定できた場合の専用エラー。
 * AiResponseInvalidErrorと同じ扱い(SQSへの再配信・DLQ送りをしない)にするために区別する。
 * `reason` はそのまま ImageAnalysis/VoiceAnalysis の `errorReason` に記録される。
 */
export class AiFatalError extends Error {
  constructor(
    message: string,
    public reason: string,
  ) {
    super(message);
    this.name = "AiFatalError";
  }
}
