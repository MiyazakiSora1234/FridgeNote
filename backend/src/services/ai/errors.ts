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
  }
}

export class AiInvocationError extends Error {}
