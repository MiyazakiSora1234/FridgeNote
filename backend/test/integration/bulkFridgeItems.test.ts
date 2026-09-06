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
});

describe("POST /v1/fridge/items/bulk", () => {
  it("creates multiple fridge items in one request, tagged with the given source", async () => {
    const env = authEnv("user-1");
    const res = await call(
      "/v1/fridge/items/bulk",
      jsonRequest({
        source: "receipt",
        items: [
          { ingredientName: "鶏もも肉", quantity: 1, unit: "pack" },
          { ingredientName: "卵", quantity: 1, unit: "pack" },
          { ingredientName: "玉ねぎ", quantity: 1, unit: "個" },
        ],
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.items).toHaveLength(3);
    expect(body.items.map((i: any) => i.name)).toEqual(["鶏もも肉", "卵", "玉ねぎ"]);
    expect(body.items.every((i: any) => i.source === "receipt")).toBe(true);

    const listRes = await json(await call("/v1/fridge/items", {}, env));
    expect(listRes.items).toHaveLength(3);
  });

  it("scopes bulk-created items to the authenticated user only", async () => {
    await call(
      "/v1/fridge/items/bulk",
      jsonRequest({ source: "voice", items: [{ ingredientName: "牛乳", quantity: 1, unit: "本" }] }),
      authEnv("user-1"),
    );
    const otherUsersList = await json(await call("/v1/fridge/items", {}, authEnv("user-2")));
    expect(otherUsersList.items).toHaveLength(0);
  });

  it("rejects an empty items array", async () => {
    const res = await call(
      "/v1/fridge/items/bulk",
      jsonRequest({ source: "receipt", items: [] }),
      authEnv("user-1"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing source", async () => {
    const res = await call(
      "/v1/fridge/items/bulk",
      jsonRequest({ items: [{ ingredientName: "卵", quantity: 1, unit: "個" }] }),
      authEnv("user-1"),
    );
    expect(res.status).toBe(400);
  });
});
