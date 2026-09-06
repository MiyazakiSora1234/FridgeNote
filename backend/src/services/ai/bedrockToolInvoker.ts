import { BedrockRuntimeClient, ConverseCommand, type Message } from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { AiFatalError, AiInvocationError, AiResponseInvalidError } from "./errors.js";

// Vision/Receipt/Voiceの各Adapterが共有するBedrock Converse API呼び出しの共通ロジック
// (リトライ・タイムアウト予算・エラー分類)。Adapterごとに個別実装すると重複するため一本化する。
const client = new BedrockRuntimeClient({});

const MODEL_ID = config.bedrockModelId;

export const MAX_RETRIES = 3;
export const INVOKE_TIMEOUT_MS = 15_000;

// infra/lambda.tf の aws_lambda_function.worker.timeout と一致させること。
export const OVERALL_BUDGET_MS = 45_000;
export const WORKER_LAMBDA_TIMEOUT_MS = 60_000;

const NON_RETRYABLE_ERROR_NAMES = new Set([
  "AccessDeniedException",
  "ValidationException",
  "ResourceNotFoundException",
  "UnrecognizedClientException",
]);

export function isRetryableError(err: unknown): boolean {
  const name = (err as { name?: unknown })?.name;
  if (typeof name !== "string") return true;
  return !NON_RETRYABLE_ERROR_NAMES.has(name);
}

function isDailyTokenQuotaExceeded(err: unknown): boolean {
  const message = (err as { message?: unknown })?.message;
  return typeof message === "string" && /too many tokens per day/i.test(message);
}

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
      await new Promise((r) => setTimeout(r, backoffMs));
    } finally {
      clearTimeout(timeout);
    }
  }
  log.error("bedrock_invocation_exhausted", { attempts: MAX_RETRIES, err: lastError });
  throw new AiInvocationError(`Bedrock invocation failed after ${MAX_RETRIES} attempts: ${String(lastError)}`);
}
