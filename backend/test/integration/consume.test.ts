import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDdb } from "./fakeDynamo.js";

const fakeDdb = createFakeDdb();

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: fakeDdb,
  TABLE_NAME: "TestTable",
}));

const { app } = await import("../../src/app.js");

function authEnv(userId: string) {
  return {
    event: { requestContext: { authorizer: { jwt: { claims: { sub: userId } } } } },
  } as any;
}

function jsonRequest(body: unknown, method = "POST") {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function call(path: string, init: unknown, env: unknown): Promise<Response> {
  return app.request(path, init as RequestInit, env as any);
}

async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeEach(() => {
  fakeDdb.store.clear();
});

describe("POST /v1/analyses idempotency", () => {
  it("creating an analysis twice for the same imageKey returns the same analysisId", async () => {
    const env = authEnv("user-1");
    const imageKey = "users/user-1/uploads/photo.jpg";

    const first = await json(await call("/v1/analyses", jsonRequest({ imageKey, type: "dish" }), env));
    const second = await json(await call("/v1/analyses", jsonRequest({ imageKey, type: "dish" }), env));

    expect(first.analysisId).toBe(second.analysisId);
  });

  it("rejects an imageKey that does not belong to the caller", async () => {
    const env = authEnv("user-1");
    const res = await call(
      "/v1/analyses",
      jsonRequest({ imageKey: "users/someone-else/uploads/photo.jpg", type: "food" }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /v1/fridge/consume", () => {
  it("decrements matched ingredients, floors at zero, and reports skipped ones", async () => {
    const userId = "user-1";
    const env = authEnv(userId);

    // 料理写真解析の完了結果を直接シードする(AI呼び出しはWorker側の責務のため統合テストの対象外)
    fakeDdb.store.set(`USER#${userId}#ANALYSIS#a1`, {
      PK: `USER#${userId}`,
      SK: "ANALYSIS#a1",
      entityType: "ImageAnalysis",
      userId,
      analysisId: "a1",
      imageKey: `users/${userId}/uploads/dish.jpg`,
      type: "dish",
      status: "completed",
      result: {
        kind: "dish",
        dish: "親子丼",
        ingredients: [
          { name: "鶏肉", ingredientId: "ing_chicken", confidence: 0.94 },
          { name: "卵", ingredientId: "ing_egg", confidence: 0.98 },
        ],
      },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    // 冷蔵庫在庫: 鶏肉300gのみ保有(卵は在庫なし)
    fakeDdb.store.set(`USER#${userId}#ITEM#item_chicken`, {
      PK: `USER#${userId}`,
      SK: "ITEM#item_chicken",
      entityType: "FridgeItem",
      userId,
      itemId: "item_chicken",
      ingredientId: "ing_chicken",
      name: "鶏肉",
      category: "meat",
      quantity: 300,
      unit: "g",
      expiresAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "manual",
    });

    const res = await call(
      "/v1/fridge/consume",
      jsonRequest({
        sourceAnalysisId: "a1",
        consumedIngredients: [
          { ingredientId: "ing_chicken", quantity: 300, unit: "g" },
          { ingredientId: "ing_egg", quantity: 2, unit: "個" },
        ],
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.consumed).toEqual([{ ingredientId: "ing_chicken", newQuantity: 0 }]);
    expect(body.skipped).toEqual([{ ingredientId: "ing_egg", reason: "not_in_fridge" }]);

    const chickenAfter = fakeDdb.store.get(`USER#${userId}#ITEM#item_chicken`);
    expect(chickenAfter?.quantity).toBe(0);
  });

  it("cannot consume against another user's analysis", async () => {
    const res = await call(
      "/v1/fridge/consume",
      jsonRequest({
        sourceAnalysisId: "does-not-exist",
        consumedIngredients: [{ ingredientId: "ing_chicken", quantity: 1, unit: "g" }],
      }),
      authEnv("user-2"),
    );
    expect(res.status).toBe(404);
  });
});
