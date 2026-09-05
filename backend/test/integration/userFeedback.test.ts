import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDdb } from "./fakeDynamo.js";

const fakeDdb = createFakeDdb();

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: fakeDdb,
  TABLE_NAME: "TestTable",
  isConditionalCheckFailed: (err: unknown) =>
    typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ConditionalCheckFailedException",
}));

const { app } = await import("../../src/app.js");
const { __resetIngredientCacheForTests } = await import("../../src/services/ingredientMaster.js");

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
  __resetIngredientCacheForTests();
});

describe("recording user feedback against the source AI analysis", () => {
  it("records the confirmed values when a food-photo analysis is turned into a fridge item", async () => {
    const userId = "user-1";
    const env = authEnv(userId);

    fakeDdb.store.set(`USER#${userId}#ANALYSIS#a1`, {
      PK: `USER#${userId}`,
      SK: "ANALYSIS#a1",
      entityType: "ImageAnalysis",
      userId,
      analysisId: "a1",
      imageKey: `users/${userId}/uploads/food.jpg`,
      type: "food",
      status: "completed",
      result: { kind: "food", name: "トマト", ingredientId: "ing_tomato", category: "vegetable", quantity: 1, unit: "個", expiresAtEstimate: null, confidence: 0.9 },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    const res = await call(
      "/v1/fridge/items",
      jsonRequest({ ingredientName: "トマト", quantity: 2, unit: "個", sourceAnalysisId: "a1" }),
      env,
    );
    expect(res.status).toBe(201);

    const analysis = await json(await call("/v1/analyses/a1", {}, env));
    expect(analysis.userFeedback).toMatchObject({
      type: "food_confirmed",
      ingredientName: "トマト",
      quantity: 2,
      unit: "個",
    });
  });

  it("does not fail fridge item creation when sourceAnalysisId does not exist (feedback recording is best-effort)", async () => {
    const env = authEnv("user-1");
    const res = await call(
      "/v1/fridge/items",
      jsonRequest({ ingredientName: "トマト", quantity: 1, unit: "個", sourceAnalysisId: "does-not-exist" }),
      env,
    );
    expect(res.status).toBe(201);
  });

  it("records which consumed ingredients the user confirmed for a dish analysis", async () => {
    const userId = "user-1";
    const env = authEnv(userId);

    fakeDdb.store.set(`USER#${userId}#ANALYSIS#a2`, {
      PK: `USER#${userId}`,
      SK: "ANALYSIS#a2",
      entityType: "ImageAnalysis",
      userId,
      analysisId: "a2",
      imageKey: `users/${userId}/uploads/dish.jpg`,
      type: "dish",
      status: "completed",
      result: { kind: "dish", dish: "親子丼", ingredients: [{ name: "鶏肉", ingredientId: "ing_chicken", confidence: 0.9 }] },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    fakeDdb.store.set(`USER#${userId}#ITEM#item1`, {
      PK: `USER#${userId}`,
      SK: "ITEM#item1",
      entityType: "FridgeItem",
      userId,
      itemId: "item1",
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
        sourceAnalysisId: "a2",
        consumedIngredients: [{ ingredientId: "ing_chicken", quantity: 300, unit: "g" }],
      }),
      env,
    );
    expect(res.status).toBe(200);

    const analysis = await json(await call("/v1/analyses/a2", {}, env));
    expect(analysis.userFeedback).toMatchObject({
      type: "dish_consumed",
      consumedIngredients: [{ ingredientId: "ing_chicken", quantity: 300, unit: "g" }],
    });
  });
});
