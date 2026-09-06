import type { z } from "zod";
import { config } from "../config";
import { getCurrentIdToken } from "../auth/cognito";
import type { AnalysisType } from "../types";
import {
  BulkCreateFridgeItemsResponseSchema,
  ConsumeResponseSchema,
  CreateAnalysisResponseSchema,
  CreateVoiceTranscriptionResponseSchema,
  FridgeItemListResponseSchema,
  FridgeItemSchema,
  ImageAnalysisSchema,
  IngredientSearchResponseSchema,
  PresignedUrlResponseSchema,
  VoiceAnalysisSchema,
} from "./schemas";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  schema: z.ZodType<T>,
): Promise<T> {
  const idToken = await getCurrentIdToken();
  if (!idToken) throw new ApiClientError(401, "UNAUTHENTICATED", "not signed in");

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      json?.error?.code ?? "UNKNOWN_ERROR",
      json?.error?.message ?? `request failed with status ${res.status}`,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // サーバーのレスポンス形状がクライアントの想定と食い違っている。
    // 型注釈だけでは検知できないため、ここでランタイム検証して早期に気づけるようにする。
    throw new ApiClientError(
      502,
      "UNEXPECTED_RESPONSE_SHAPE",
      `${path} のレスポンスが想定と異なります: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** レスポンスボディを検証する必要がないエンドポイント(204 No Content等)向け。 */
async function requestVoid(path: string, init: { method?: string; body?: unknown } = {}): Promise<void> {
  const idToken = await getCurrentIdToken();
  if (!idToken) throw new ApiClientError(401, "UNAUTHENTICATED", "not signed in");

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) return;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      json?.error?.code ?? "UNKNOWN_ERROR",
      json?.error?.message ?? `request failed with status ${res.status}`,
    );
  }
}

export const api = {
  createPresignedUrl: (contentType: string) =>
    request(
      "/v1/images/presigned-url",
      { method: "POST", body: { contentType } },
      PresignedUrlResponseSchema,
    ),

  /** 画像・音声どちらも同じ仕組み(Presigned URLへの直接PUT)でアップロードするため共通化している。 */
  uploadFileToS3: async (uploadUrl: string, fileUri: string, contentType: string): Promise<void> => {
    const blob = await (await fetch(fileUri)).blob();
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!res.ok) throw new Error(`S3 upload failed with status ${res.status}`);
  },

  createAnalysis: (imageKey: string, type: AnalysisType) =>
    request("/v1/analyses", { method: "POST", body: { imageKey, type } }, CreateAnalysisResponseSchema),

  getAnalysis: (analysisId: string) => request(`/v1/analyses/${analysisId}`, {}, ImageAnalysisSchema),

  listFridgeItems: () => request("/v1/fridge/items", {}, FridgeItemListResponseSchema),

  createFridgeItem: (input: {
    ingredientName: string;
    quantity: number;
    unit: string;
    expiresAt?: string | null;
    sourceAnalysisId?: string;
  }) => request("/v1/fridge/items", { method: "POST", body: input }, FridgeItemSchema),

  /** レシート/音声の確認画面で「すべて追加」を押したときに呼ぶ一括登録。 */
  createFridgeItemsBulk: (input: {
    source: "receipt" | "voice";
    sourceAnalysisId?: string;
    items: Array<{ ingredientName: string; quantity: number; unit: string }>;
  }) => request("/v1/fridge/items/bulk", { method: "POST", body: input }, BulkCreateFridgeItemsResponseSchema),

  updateFridgeItem: (itemId: string, patch: { quantity?: number; unit?: string; expiresAt?: string | null }) =>
    request(`/v1/fridge/items/${itemId}`, { method: "PATCH", body: patch }, FridgeItemSchema),

  deleteFridgeItem: (itemId: string) => requestVoid(`/v1/fridge/items/${itemId}`, { method: "DELETE" }),

  consume: (input: {
    sourceAnalysisId: string;
    consumedIngredients: Array<{ ingredientId: string; quantity: number; unit: string }>;
  }) => request("/v1/fridge/consume", { method: "POST", body: input }, ConsumeResponseSchema),

  createVoiceTranscription: (audioKey: string) =>
    request("/v1/voice/transcriptions", { method: "POST", body: { audioKey } }, CreateVoiceTranscriptionResponseSchema),

  getVoiceTranscription: (analysisId: string) =>
    request(`/v1/voice/transcriptions/${analysisId}`, {}, VoiceAnalysisSchema),

  searchIngredients: (query: string, limit?: number) =>
    request("/v1/ingredients/search", { method: "POST", body: { query, limit } }, IngredientSearchResponseSchema),
};
