import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  type MediaFormat,
} from "@aws-sdk/client-transcribe";
import { logger } from "../../lib/logger.js";
import { AiInvocationError } from "./errors.js";

const log = logger.child({ component: "TranscriptionService" });

export interface TranscriptionService {
  /** S3上の音声ファイルを文字起こしする。音声データ自体はLambdaへダウンロードせず、Transcribeへは S3 URI を渡す。 */
  transcribe(input: { s3Uri: string; mediaFormat: MediaFormat; jobName: string }): Promise<string>;
}

const client = new TranscribeClient({});

const POLL_INTERVAL_MS = 2000;
/**
 * Transcribeジョブの完了待ちに使ってよい時間の上限。Analyzer Workerの
 * Lambdaタイムアウト(60秒)のうち、Bedrockでの構造化解析・DynamoDB書き込み分の
 * 余裕を残すため40秒とする(BedrockVisionAdapterのOVERALL_BUDGET_MSと同じ考え方)。
 */
export const TRANSCRIBE_WAIT_BUDGET_MS = 40_000;

/**
 * Amazon Transcribeを利用した音声文字起こし実装。
 * StartTranscriptionJob は非同期ジョブAPIのため、完了するまでポーリングする。
 * 出力は既定のAWS管理バケットに書き込まれ、GetTranscriptionJobのレスポンスに
 * 一時的な署名付きURL(TranscriptFileUri)が含まれるため、そこから直接fetchする
 * (自前でS3出力バケット・バケットポリシーを用意する必要がない)。
 */
export class TranscribeTranscriptionService implements TranscriptionService {
  async transcribe(input: { s3Uri: string; mediaFormat: MediaFormat; jobName: string }): Promise<string> {
    const jobLog = log.child({ jobName: input.jobName });
    try {
      await client.send(
        new StartTranscriptionJobCommand({
          TranscriptionJobName: input.jobName,
          Media: { MediaFileUri: input.s3Uri },
          MediaFormat: input.mediaFormat,
          LanguageCode: "ja-JP",
        }),
      );
      jobLog.info("transcribe_job_started");
    } catch (err) {
      jobLog.error("transcribe_start_job_failed", { err });
      throw new AiInvocationError(`Transcribe StartTranscriptionJob failed: ${String(err)}`);
    }

    const start = Date.now();
    while (Date.now() - start < TRANSCRIBE_WAIT_BUDGET_MS) {
      const res = await client.send(
        new GetTranscriptionJobCommand({ TranscriptionJobName: input.jobName }),
      );
      const job = res.TranscriptionJob;
      if (job?.TranscriptionJobStatus === "COMPLETED") {
        const uri = job.Transcript?.TranscriptFileUri;
        if (!uri) {
          jobLog.error("transcribe_job_completed_without_transcript_uri", { durationMs: Date.now() - start });
          throw new AiInvocationError("Transcribe job completed but no TranscriptFileUri returned");
        }
        jobLog.info("transcribe_job_completed", { durationMs: Date.now() - start });
        return this.fetchTranscriptText(uri, jobLog);
      }
      if (job?.TranscriptionJobStatus === "FAILED") {
        jobLog.error("transcribe_job_failed", { durationMs: Date.now() - start, failureReason: job.FailureReason });
        throw new AiInvocationError(`Transcribe job failed: ${job.FailureReason ?? "unknown reason"}`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    jobLog.error("transcribe_job_wait_timed_out", { budgetMs: TRANSCRIBE_WAIT_BUDGET_MS });
    throw new AiInvocationError(`Transcribe job did not complete within ${TRANSCRIBE_WAIT_BUDGET_MS}ms`);
  }

  private async fetchTranscriptText(transcriptFileUri: string, jobLog: typeof log): Promise<string> {
    const res = await fetch(transcriptFileUri);
    if (!res.ok) {
      jobLog.error("transcribe_fetch_output_failed", { status: res.status });
      throw new AiInvocationError(`Failed to fetch Transcribe output: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { results?: { transcripts?: Array<{ transcript?: string }> } };
    const text = json.results?.transcripts?.[0]?.transcript;
    if (!text) {
      jobLog.error("transcribe_output_missing_transcript");
      throw new AiInvocationError("Transcribe output did not contain a transcript");
    }
    return text;
  }
}

/** テスト用。実際のTranscribeを呼ばず、固定のテキストを返す。 */
export class MockTranscriptionService implements TranscriptionService {
  constructor(private readonly fixedText: string = "鶏もも肉300グラムと卵6個を追加") {}

  async transcribe(): Promise<string> {
    return this.fixedText;
  }
}
