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
    event: {
      requestContext: { authorizer: { jwt: { claims: { sub: userId } } } },
    },
  } as any;
}

function jsonRequest(body: unknown, method = "POST") {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
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

describe("fridge routes", () => {
  it("rejects requests without a valid JWT sub claim", async () => {
    const res = await call(
      "/v1/fridge/items",
      {},
      { event: { requestContext: { authorizer: { jwt: { claims: {} } } } } },
    );
    expect(res.status).toBe(401);
  });

  it("creates, lists, updates and deletes a fridge item, scoped to the authenticated user", async () => {
    const env = authEnv("user-1");

    const createRes = await call(
      "/v1/fridge/items",
      jsonRequest({ ingredientName: "トマト", quantity: 2, unit: "個", expiresAt: "2026-09-10" }),
      env,
    );
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    expect(created.name).toBe("トマト");
    expect(created.quantity).toBe(2);

    const listRes = await call("/v1/fridge/items", {}, env);
    const list = await json(listRes);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].expiryStatus).toBeDefined();

    const patchRes = await call(
      `/v1/fridge/items/${created.itemId}`,
      jsonRequest({ quantity: 1 }, "PATCH"),
      env,
    );
    expect(patchRes.status).toBe(200);
    const patched = await json(patchRes);
    expect(patched.quantity).toBe(1);

    const deleteRes = await call(`/v1/fridge/items/${created.itemId}`, { method: "DELETE" }, env);
    expect(deleteRes.status).toBe(204);

    const listAfterDelete = await json(await call("/v1/fridge/items", {}, env));
    expect(listAfterDelete.items).toHaveLength(0);
  });

  it("does not let one user see or modify another user's fridge items", async () => {
    const ownerEnv = authEnv("user-1");
    const attackerEnv = authEnv("user-2");

    const createRes = await call(
      "/v1/fridge/items",
      jsonRequest({ ingredientName: "鶏肉", quantity: 300, unit: "g" }),
      ownerEnv,
    );
    const created = await json(createRes);

    const attackerList = await json(await call("/v1/fridge/items", {}, attackerEnv));
    expect(attackerList.items).toHaveLength(0);

    const attackerPatch = await call(
      `/v1/fridge/items/${created.itemId}`,
      jsonRequest({ quantity: 999 }, "PATCH"),
      attackerEnv,
    );
    expect(attackerPatch.status).toBe(404);
  });

  it("normalizes ingredient name variants to the same ingredientId", async () => {
    const env = authEnv("user-1");
    const first = await json(
      await call(
        "/v1/fridge/items",
        jsonRequest({ ingredientName: "トマト", quantity: 1, unit: "個" }),
        env,
      ),
    );
    const second = await json(
      await call(
        "/v1/fridge/items",
        jsonRequest({ ingredientName: "とまと", quantity: 1, unit: "個" }),
        env,
      ),
    );

    expect(first.ingredientId).toBe(second.ingredientId);
  });

  it("rejects invalid request bodies with 400", async () => {
    const env = authEnv("user-1");
    const res = await call(
      "/v1/fridge/items",
      jsonRequest({ ingredientName: "", quantity: -1, unit: "個" }),
      env,
    );
    expect(res.status).toBe(400);
  });
});
