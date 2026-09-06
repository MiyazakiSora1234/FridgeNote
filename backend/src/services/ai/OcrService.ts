import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { logger } from "../../lib/logger.js";
import { AiInvocationError } from "./errors.js";

const log = logger.child({ component: "OcrService" });

/**
 * レシート画像からテキストを抽出するOCRの境界。
 * OCRエンジン(Textract)をここで隠蔽し、Worker側はOcrServiceのインターフェースにだけ依存する。
 */
export interface OcrService {
  extractText(input: { base64: string; contentType: string }): Promise<string>;
}

const client = new TextractClient({});

/**
 * Amazon Textractを利用したOCR実装。
 *
 * 採用理由(コスト・構成の検討結果): レシートは1〜2ページの単純な感熱紙レシートで
 * 複雑なレイアウト解析は不要なため、非同期ジョブ(StartDocumentTextDetection)ではなく
 * 同期API(DetectDocumentText)を使う。同期APIは画像バイトを直接渡してその場で結果が
 * 返るため、S3出力バケットの設定やポーリングが不要でLambda実装がシンプルになり、
 * Analyzer Worker Lambdaのタイムアウト予算内(既存のBedrock呼び出しと合わせて60秒以内)
 * にも収めやすい。1回あたりの課金もページ単位でごく小額($1.50/1000ページ程度)であり、
 * 5ユーザー・月1,000円以下の制約と両立する。
 */
export class TextractOcrService implements OcrService {
  async extractText(input: { base64: string; contentType: string }): Promise<string> {
    const start = Date.now();
    try {
      const res = await client.send(
        new DetectDocumentTextCommand({
          Document: { Bytes: Buffer.from(input.base64, "base64") },
        }),
      );
      const lines = (res.Blocks ?? [])
        .filter((block) => block.BlockType === "LINE" && block.Text)
        .map((block) => block.Text as string);
      log.info("textract_detect_document_text_succeeded", {
        durationMs: Date.now() - start,
        lineCount: lines.length,
      });
      return lines.join("\n");
    } catch (err) {
      log.error("textract_detect_document_text_failed", { durationMs: Date.now() - start, err });
      throw new AiInvocationError(`Textract OCR failed: ${String(err)}`);
    }
  }
}

/** テスト用。実際のTextractを呼ばず、固定のOCR結果を返す。 */
export class MockOcrService implements OcrService {
  constructor(private readonly fixedText: string = "鶏もも肉 298\nたまご 248\n玉ねぎ 198") {}

  async extractText(): Promise<string> {
    return this.fixedText;
  }
}
