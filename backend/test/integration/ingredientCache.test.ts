import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDdb } from "./fakeDynamo.js";

type Command = { constructor: { name: string }; input: Record<string, unknown> };

const fakeDdb = createFakeDdb();
const sendSpy = vi.fn((command: Command) => fakeDdb.send(command));

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: { send: (command: Command) => sendSpy(command) },
  TABLE_NAME: "TestTable",
}));

const { resolveIngredientId, __resetIngredientCacheForTests } = await import(
  "../../src/services/ingredientMaster.js"
);

beforeEach(() => {
  fakeDdb.store.clear();
  __resetIngredientCacheForTests();
  sendSpy.mockClear();
});

function queryCallCount(): number {
  return sendSpy.mock.calls.filter((call) => call[0].constructor.name === "QueryCommand").length;
}

describe("ingredient master cache", () => {
  it("only queries DynamoDB once across repeated resolves within the TTL window", async () => {
    await resolveIngredientId("トマト");
    expect(queryCallCount()).toBe(1);

    await resolveIngredientId("とまと"); // 表記ゆれ違いでも同じ正規化名 -> キャッシュ命中のはず
    await resolveIngredientId("トマト");
    expect(queryCallCount()).toBe(1); // 追加のQueryは発生しない
  });

  it("makes a newly created ingredient visible to subsequent resolves without re-querying", async () => {
    const first = await resolveIngredientId("新食材");
    const callsAfterCreate = queryCallCount();

    const second = await resolveIngredientId("新食材");
    expect(second.ingredientId).toBe(first.ingredientId);
    expect(queryCallCount()).toBe(callsAfterCreate); // キャッシュへの即時追加により再クエリなし
  });

  it("__resetIngredientCacheForTests forces a fresh query on the next resolve", async () => {
    await resolveIngredientId("にんじん");
    expect(queryCallCount()).toBe(1);

    __resetIngredientCacheForTests();
    await resolveIngredientId("にんじん");
    expect(queryCallCount()).toBe(2);
  });
});
