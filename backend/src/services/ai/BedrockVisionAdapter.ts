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
import { AiInvocationError, AiResponseInvalidError, type VisionAnalysisAdapter } from "./VisionAnalysisAdapter.js";

const client = new BedrockRuntimeClient({});

// コスト最優先のためデフォルトは軽量マルチモーダルモデル(Amazon Nova Lite)。
// Parameter Store等から上書き可能にし、モデル差し替えをコード変更なしで行えるようにする。
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
const MAX_RETRIES = 3;
const INVOKE_TIMEOUT_MS = 25_000;

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

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
