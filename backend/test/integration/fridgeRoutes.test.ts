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

  it("decrementBy atomically subtracts quantity without a read-then-overwrite race (手動で減らす)", async () => {
    const env = authEnv("user-1");
    const created = await json(
      await call("/v1/fridge/items", jsonRequest({ ingredientName: "卵", quantity: 10, unit: "個" }), env),
    );

    // 2つの減算リクエストを並列で送る。クライアント側で「現在値-入力値」を計算する
    // 方式だと片方の減算が失われうるが、decrementByはサーバー側のADD式で
    // 原子的に処理されるため、両方とも正しく反映されるはず。
    const [res1, res2] = await Promise.all([
      call(`/v1/fridge/items/${created.itemId}`, jsonRequest({ decrementBy: 3 }, "PATCH"), env),
      call(`/v1/fridge/items/${created.itemId}`, jsonRequest({ decrementBy: 2 }, "PATCH"), env),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const final = await json(await call(`/v1/fridge/items`, {}, env));
    expect(final.items[0].quantity).toBe(5); // 10 - 3 - 2
  });

  it("rejects decrementBy when it would take the quantity below zero (409, stock may have changed)", async () => {
    const env = authEnv("user-1");
    const created = await json(
      await call("/v1/fridge/items", jsonRequest({ ingredientName: "牛乳", quantity: 1, unit: "本" }), env),
    );

    const res = await call(`/v1/fridge/items/${created.itemId}`, jsonRequest({ decrementBy: 5 }, "PATCH"), env);
    expect(res.status).toBe(409);

    const unchanged = await json(await call(`/v1/fridge/items`, {}, env));
    expect(unchanged.items[0].quantity).toBe(1); // 変更されていない
  });

  it("rejects specifying both quantity and decrementBy in the same request", async () => {
    const env = authEnv("user-1");
    const created = await json(
      await call("/v1/fridge/items", jsonRequest({ ingredientName: "にんじん", quantity: 2, unit: "本" }), env),
    );

    const res = await call(
      `/v1/fridge/items/${created.itemId}`,
      jsonRequest({ quantity: 1, decrementBy: 1 }, "PATCH"),
      env,
    );
    expect(res.status).toBe(400);
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
