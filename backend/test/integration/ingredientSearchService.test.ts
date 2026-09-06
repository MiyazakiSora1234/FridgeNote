import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDdb } from "./fakeDynamo.js";

const fakeDdb = createFakeDdb();

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: fakeDdb,
  TABLE_NAME: "TestTable",
}));

const { __resetIngredientCacheForTests } = await import("../../src/services/ingredientMaster.js");
const { AliasIngredientSearchService } = await import("../../src/services/ingredientSearchService.js");

const service = new AliasIngredientSearchService();

function seedIngredient(id: string, name: string, category: string, aliases: string[]) {
  fakeDdb.store.set(`INGREDIENT#${id}#METADATA`, {
    PK: `INGREDIENT#${id}`,
    SK: "METADATA",
    GSI3PK: "INGREDIENT_MASTER",
    GSI3SK: `NAME#${name}`,
    entityType: "Ingredient",
    id,
    name,
    category,
    aliases,
    createdAt: "2026-09-01T00:00:00.000Z",
  });
}

beforeEach(() => {
  fakeDdb.store.clear();
  __resetIngredientCacheForTests();
  seedIngredient("ing_tomato", "トマト", "vegetable", ["とまと", "tomato"]);
  seedIngredient("ing_chicken_thigh", "鶏もも肉", "meat", ["鶏もも", "鶏モモ"]);
  seedIngredient("ing_chicken_breast", "鶏むね肉", "meat", ["鶏むね"]);
});

describe("AliasIngredientSearchService", () => {
  it("ranks an exact name match highest (score 1)", async () => {
    const results = await service.search("トマト", 5);
    expect(results[0]).toMatchObject({ ingredientId: "ing_tomato", score: 1 });
  });

  it("matches across script variants (katakana/hiragana are the same normalized name; romaji is an alias)", async () => {
    const viaHiragana = await service.search("とまと", 5);
    expect(viaHiragana[0]).toMatchObject({ ingredientId: "ing_tomato", score: 1 });

    const viaRomaji = await service.search("tomato", 5);
    expect(viaRomaji[0]).toMatchObject({ ingredientId: "ing_tomato", score: 0.9 });
  });

  it("surfaces a partial match (鶏もも -> 鶏もも肉) as a lower-scored candidate", async () => {
    const results = await service.search("鶏もも", 5);
    const top = results[0];
    expect(top?.ingredientId).toBe("ing_chicken_thigh");
    expect(top?.score).toBeGreaterThan(0.5);
  });

  it("does not conflate 鶏もも肉 and 鶏むね肉 as the same ingredient (only exact/alias match counts as 'same')", async () => {
    const results = await service.search("鶏もも肉", 5);
    const exact = results.find((r) => r.score === 1);
    expect(exact?.ingredientId).toBe("ing_chicken_thigh");
    const breast = results.find((r) => r.ingredientId === "ing_chicken_breast");
    if (breast) expect(breast.score).toBeLessThan(1);
  });

  it("returns an empty array for a query with no plausible match", async () => {
    const results = await service.search("宇宙食", 5);
    expect(results).toHaveLength(0);
  });

  it("respects the limit parameter", async () => {
    const results = await service.search("鶏", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
