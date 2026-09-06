import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDdb } from "./fakeDynamo.js";

type Command = { constructor: { name: string }; input: Record<string, unknown> };

const fakeDdb = createFakeDdb();
const sendSpy = vi.fn((command: Command) => fakeDdb.send(command));

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: { send: (command: Command) => sendSpy(command) },
  TABLE_NAME: "TestTable",
  isConditionalCheckFailed: (err: unknown) =>
    typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ConditionalCheckFailedException",
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

  it("does not create duplicate master entries when two requests race to create the same new ingredient", async () => {
    // レシート/音声の一括正規化は複数アイテムをPromise.allで並列処理するため、
    // 同じ未登録食材名が同時に複数回resolveIngredientIdへ渡されることがある。
    // idを正規化名から決定論的に導出しているため、両方とも同じPKへPutを試み、
    // 後着はConditionalCheckFailedExceptionを受けて先着の結果を再利用するはず
    // (以前はULID採番だったため、ここで食材マスターに重複行ができていた)。
    const [first, second] = await Promise.all([
      resolveIngredientId("新食材レース"),
      resolveIngredientId("新食材レース"),
    ]);

    expect(first.ingredientId).toBe(second.ingredientId);

    const masterEntries = [...fakeDdb.store.values()].filter(
      (item) => (item as { entityType?: string }).entityType === "Ingredient",
    );
    expect(masterEntries).toHaveLength(1);
  });
});
