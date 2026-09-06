import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { logger } from "../../lib/logger.js";
import { AiInvocationError } from "./errors.js";

const log = logger.child({ component: "OcrService" });

// OCRエンジン(Textract)をここで隠蔽し、Worker側はこのインターフェースにだけ依存する。
export interface OcrService {
  extractText(input: { base64: string; contentType: string }): Promise<string>;
}

const client = new TextractClient({});

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

export class MockOcrService implements OcrService {
  constructor(private readonly fixedText: string = "鶏もも肉 298\nたまご 248\n玉ねぎ 198") {}

  async extractText(): Promise<string> {
    return this.fixedText;
  }
}
