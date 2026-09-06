import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import {
  DISH_ANALYSIS_JSON_SCHEMA,
  FOOD_ANALYSIS_JSON_SCHEMA,
  RawDishAnalysisSchema,
  RawFoodAnalysisSchema,
  type RawDishAnalysis,
  type RawFoodAnalysis,
} from "../../schemas/aiSchemas.js";
import { config } from "../../lib/config.js";
import { AiInvocationError, AiResponseInvalidError, type VisionAnalysisAdapter } from "./VisionAnalysisAdapter.js";

const client = new BedrockRuntimeClient({});

// コスト最優先のためデフォルトは軽量マルチモーダルモデル(Amazon Nova Lite)。
// 環境変数(BEDROCK_MODEL_ID)で上書き可能にし、モデル差し替えをコード変更なしで行えるようにする。
const MODEL_ID = config.bedrockModelId;

// テストからガードレール(下のtest/unit/bedrockTiming.test.ts)としてimportできるようexportする。
export const MAX_RETRIES = 3;
export const INVOKE_TIMEOUT_MS = 15_000;

/**
 * リトライ全体(Bedrock呼び出し部分だけ)にかけてよい時間の上限。
 * Analyzer WorkerのLambdaタイムアウトは60秒(infra/lambda.tf の
 * aws_lambda_function.worker.timeout)なので、S3からの画像取得・
 * 食材マスター解決・DynamoDB書き込みの分の余裕(約15秒)を差し引いた45秒とする。
 * これを設けないと、MAX_RETRIES×INVOKE_TIMEOUT_MSの理論上の最悪値
 * (3×25秒=75秒、旧設定)がLambda自体のタイムアウトを超えてしまい、
 * failAnalysis()すら呼ばれないまま強制終了する事故につながっていた。
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

const FOOD_TOOL_NAME = "report_food_analysis";
const DISH_TOOL_NAME = "report_dish_analysis";

function mediaFormatFromContentType(contentType: string): "jpeg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpeg";
}

async function invokeWithTool<T>(params: {
  systemPrompt: string;
  userText: string;
  image: { base64: string; contentType: string };
  toolName: string;
  toolDescription: string;
  jsonSchema: Record<string, unknown>;
  parse: (raw: unknown) => T;
}): Promise<T> {
  const messages: Message[] = [
    {
      role: "user",
      content: [
        { text: params.userText },
        {
          image: {
            format: mediaFormatFromContentType(params.image.contentType),
            source: { bytes: Buffer.from(params.image.base64, "base64") },
          },
        },
      ],
    },
  ];

  const overallStart = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (Date.now() - overallStart >= OVERALL_BUDGET_MS) {
      // 次の試行を始めると全体の時間予算を超える(≒呼び出し元のLambdaタイムアウトに
      // 近づきすぎる)ため、新たな試行は始めずここで打ち切る。
      throw new AiInvocationError(
        `Bedrock invocation aborted after ${attempt - 1} attempt(s): exceeded overall time budget of ${OVERALL_BUDGET_MS}ms`,
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
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
        throw new AiResponseInvalidError("no tool_use block returned by model", res);
      }
      return params.parse(toolUseBlock.input);
    } catch (err) {
      if (err instanceof AiResponseInvalidError) throw err;
      lastError = err;
      if (!isRetryableError(err)) {
        throw new AiInvocationError(`Bedrock invocation failed with a non-retryable error: ${String(err)}`);
      }
      // 指数バックオフで再試行(Bedrockのスロットリング/一時的タイムアウト対策)
      await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new AiInvocationError(`Bedrock invocation failed after ${MAX_RETRIES} attempts: ${String(lastError)}`);
}

export class BedrockVisionAdapter implements VisionAnalysisAdapter {
  async analyzeFoodImage(input: { base64: string; contentType: string }): Promise<RawFoodAnalysis> {
    return invokeWithTool({
      systemPrompt:
        "あなたは食品画像認識アシスタントです。画像に写っている単一の食材を分析し、必ず提供されたツールを使って構造化データのみで回答してください。自由形式の文章では回答しないでください。",
      userText: "この画像に写っている食材を分析してください。",
      image: input,
      toolName: FOOD_TOOL_NAME,
      toolDescription: "画像から検出した食材の情報を報告する",
      jsonSchema: FOOD_ANALYSIS_JSON_SCHEMA,
      parse: (raw) => {
        const result = RawFoodAnalysisSchema.safeParse(raw);
        if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
        return result.data;
      },
    });
  }

  async analyzeDishImage(input: { base64: string; contentType: string }): Promise<RawDishAnalysis> {
    return invokeWithTool({
      systemPrompt:
        "あなたは料理画像認識アシスタントです。画像に写っている料理名と、使用されている可能性が高い食材の候補をconfidence付きで報告してください。必ず提供されたツールを使って構造化データのみで回答してください。実際に使用されたかどうかは断定せず、あくまで候補として扱ってください。",
      userText: "この画像の料理名と、使用されている可能性がある食材候補を分析してください。",
      image: input,
      toolName: DISH_TOOL_NAME,
      toolDescription: "画像から検出した料理と使用食材候補を報告する",
      jsonSchema: DISH_ANALYSIS_JSON_SCHEMA,
      parse: (raw) => {
        const result = RawDishAnalysisSchema.safeParse(raw);
        if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
        return result.data;
      },
    });
  }
}
