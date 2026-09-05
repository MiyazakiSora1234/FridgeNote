import { config } from "../config";
import { getCurrentIdToken } from "../auth/cognito";

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

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      json?.error?.code ?? "UNKNOWN_ERROR",
      json?.error?.message ?? `request failed with status ${res.status}`,
    );
  }
  return json as T;
}

export const api = {
  createPresignedUrl: (contentType: string) =>
    request<{ imageKey: string; uploadUrl: string; expiresIn: number }>("/v1/images/presigned-url", {
      method: "POST",
      body: { contentType },
    }),

  uploadImageToS3: async (uploadUrl: string, fileUri: string, contentType: string): Promise<void> => {
    const blob = await (await fetch(fileUri)).blob();
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!res.ok) throw new Error(`S3 upload failed with status ${res.status}`);
  },

  createAnalysis: (imageKey: string, type: "food" | "dish") =>
    request<{ analysisId: string; status: string }>("/v1/analyses", {
      method: "POST",
      body: { imageKey, type },
    }),

  getAnalysis: (analysisId: string) => request<import("../types").ImageAnalysis>(`/v1/analyses/${analysisId}`),

  listFridgeItems: () => request<{ items: import("../types").FridgeItem[] }>("/v1/fridge/items"),

  createFridgeItem: (input: {
    ingredientName: string;
    quantity: number;
    unit: string;
    expiresAt?: string | null;
    sourceAnalysisId?: string;
  }) => request("/v1/fridge/items", { method: "POST", body: input }),

  updateFridgeItem: (itemId: string, patch: { quantity?: number; unit?: string; expiresAt?: string | null }) =>
    request(`/v1/fridge/items/${itemId}`, { method: "PATCH", body: patch }),

  deleteFridgeItem: (itemId: string) => request<void>(`/v1/fridge/items/${itemId}`, { method: "DELETE" }),

  consume: (input: {
    sourceAnalysisId: string;
    consumedIngredients: Array<{ ingredientId: string; quantity: number; unit: string }>;
  }) =>
    request<{
      consumed: Array<{ ingredientId: string; newQuantity: number }>;
      skipped: Array<{ ingredientId: string; reason: string }>;
    }>("/v1/fridge/consume", { method: "POST", body: input }),
};
