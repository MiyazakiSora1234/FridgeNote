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
  return { event: { requestContext: { authorizer: { jwt: { claims: { sub: userId } } } } } } as any;
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
  fakeDdb.store.set("INGREDIENT#ing_tomato#METADATA", {
    PK: "INGREDIENT#ing_tomato",
    SK: "METADATA",
    GSI3PK: "INGREDIENT_MASTER",
    GSI3SK: "NAME#とまと",
    entityType: "Ingredient",
    id: "ing_tomato",
    name: "トマト",
    category: "vegetable",
    aliases: ["とまと", "tomato"],
    createdAt: "2026-09-01T00:00:00.000Z",
  });
});

describe("POST /v1/ingredients/search", () => {
  it("returns matching candidates for an authenticated request", async () => {
    const res = await call("/v1/ingredients/search", jsonRequest({ query: "トマト" }), authEnv("user-1"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.candidates[0]).toMatchObject({ ingredientId: "ing_tomato", score: 1 });
  });

  it("requires authentication", async () => {
    const res = await call(
      "/v1/ingredients/search",
      jsonRequest({ query: "トマト" }),
      { event: { requestContext: { authorizer: { jwt: { claims: {} } } } } },
    );
    expect(res.status).toBe(401);
  });

  it("rejects an empty query", async () => {
    const res = await call("/v1/ingredients/search", jsonRequest({ query: "" }), authEnv("user-1"));
    expect(res.status).toBe(400);
  });
});
