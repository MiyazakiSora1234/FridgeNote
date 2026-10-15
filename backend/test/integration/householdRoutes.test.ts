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

const authEnv = (userId: string) =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub: userId } } } } } }) as any;

const req = (body?: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const call = (path: string, init: unknown, userId: string) => app.request(path, init as RequestInit, authEnv(userId));
const json = async (res: Response): Promise<any> => res.json();

async function invite(userId: string): Promise<string> {
  const res = await call("/v1/household/invites", req(), userId);
  expect(res.status).toBe(201);
  return (await json(res)).code;
}

async function addItem(userId: string, name: string) {
  const res = await call("/v1/fridge/items", req({ ingredientName: name, quantity: 1, unit: "個" }), userId);
  expect(res.status).toBe(201);
  return json(res);
}

async function listNames(userId: string): Promise<string[]> {
  return (await json(await call("/v1/fridge/items", {}, userId))).items.map((i: any) => i.name);
}

beforeEach(() => {
  fakeDdb.store.clear();
  __resetIngredientCacheForTests();
});

describe("household", () => {
  it("starts as a personal household owned by the user", async () => {
    const res = await call("/v1/household", {}, "alice");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.householdId).toBe("alice");
    expect(body.role).toBe("owner");
    expect(body.members).toEqual([{ userId: "alice", role: "owner", isSelf: true }]);
  });

  it("keeps existing personal data visible without migration", async () => {
    // 既存ユーザーのデータは PK=USER#<sub> のまま。世帯機能導入後も同じデータが見える。
    await addItem("alice", "トマト");
    expect(await listNames("alice")).toEqual(["トマト"]);
  });

  it("shares fridge items between members after joining with an invite code", async () => {
    await addItem("alice", "トマト");
    const code = await invite("alice");
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);

    const joinRes = await call("/v1/household/join", req({ code: code.toLowerCase(), displayName: "ボブ" }), "bob");
    expect(joinRes.status).toBe(200);
    const joined = await json(joinRes);
    expect(joined.householdId).toBe("alice");
    expect(joined.role).toBe("member");
    expect(joined.members.map((m: any) => m.userId)).toEqual(["alice", "bob"]);
    expect(joined.members[1].displayName).toBe("ボブ");

    expect(await listNames("bob")).toEqual(["トマト"]);
    await addItem("bob", "牛乳");
    expect((await listNames("alice")).sort()).toEqual(["トマト", "牛乳"].sort());
  });

  it("does not trust a client-supplied householdId", async () => {
    await addItem("alice", "トマト");
    const res = await call("/v1/fridge/items?householdId=alice", { headers: { "x-household-id": "alice" } }, "mallory");
    expect((await json(res)).items).toEqual([]);
  });

  it("invite codes are single-use", async () => {
    const code = await invite("alice");
    expect((await call("/v1/household/join", req({ code }), "bob")).status).toBe(200);
    expect((await call("/v1/household/join", req({ code }), "carol")).status).toBe(404);
  });

  it("rejects unknown and expired codes", async () => {
    expect((await call("/v1/household/join", req({ code: "ZZZZZZZZ" }), "bob")).status).toBe(404);

    const code = await invite("alice");
    fakeDdb.store.get(`INVITE#${code}#METADATA`)!.expiresEpoch = Math.floor(Date.now() / 1000) - 1;
    expect((await call("/v1/household/join", req({ code }), "bob")).status).toBe(404);
  });

  it("rejects joining your own household, or a second household", async () => {
    const aliceCode = await invite("alice");
    expect((await call("/v1/household/join", req({ code: aliceCode }), "alice")).status).toBe(400);

    expect((await call("/v1/household/join", req({ code: aliceCode }), "bob")).status).toBe(200);
    const carolCode = await invite("carol");
    expect((await call("/v1/household/join", req({ code: carolCode }), "bob")).status).toBe(409);
  });

  it("refuses to let an owner with members join another household", async () => {
    const aliceCode = await invite("alice");
    await call("/v1/household/join", req({ code: aliceCode }), "bob");
    const carolCode = await invite("carol");
    expect((await call("/v1/household/join", req({ code: carolCode }), "alice")).status).toBe(409);
  });

  it("enforces the member cap", async () => {
    for (let i = 0; i < 9; i++) {
      const code = await invite("alice");
      expect((await call("/v1/household/join", req({ code }), `member-${i}`)).status).toBe(200);
    }
    const code = await invite("alice");
    expect((await call("/v1/household/join", req({ code }), "one-too-many")).status).toBe(409);
  });

  it("restores the member's own data after leaving", async () => {
    await addItem("bob", "ニンジン");
    await addItem("alice", "トマト");
    const code = await invite("alice");
    await call("/v1/household/join", req({ code }), "bob");
    expect(await listNames("bob")).toEqual(["トマト"]);

    expect((await call("/v1/household/leave", req(), "bob")).status).toBe(204);
    expect(await listNames("bob")).toEqual(["ニンジン"]);
    expect(await listNames("alice")).toEqual(["トマト"]);
    expect((await json(await call("/v1/household", {}, "alice"))).members).toHaveLength(1);
  });

  it("does not allow the owner to leave", async () => {
    expect((await call("/v1/household/leave", req(), "alice")).status).toBe(409);
  });

  it("lets only the owner remove a member", async () => {
    await call("/v1/household/join", req({ code: await invite("alice") }), "bob");
    await call("/v1/household/join", req({ code: await invite("alice") }), "carol");

    expect((await call("/v1/household/members/carol", req(undefined, "DELETE"), "bob")).status).toBe(409);
    expect((await call("/v1/household/members/alice", req(undefined, "DELETE"), "alice")).status).toBe(400);
    expect((await call("/v1/household/members/nobody", req(undefined, "DELETE"), "alice")).status).toBe(404);

    expect((await call("/v1/household/members/carol", req(undefined, "DELETE"), "alice")).status).toBe(204);
    expect((await json(await call("/v1/household", {}, "alice"))).members.map((m: any) => m.userId)).toEqual([
      "alice",
      "bob",
    ]);
    expect((await json(await call("/v1/household", {}, "carol"))).householdId).toBe("carol");
  });

  it("scopes upload keys to the household, so members cannot reference their own user prefix", async () => {
    await call("/v1/household/join", req({ code: await invite("alice") }), "bob");
    const res = await call("/v1/analyses", req({ imageKey: "users/bob/uploads/x.jpg", type: "food" }), "bob");
    expect(res.status).toBe(403);
    const ok = await call("/v1/analyses", req({ imageKey: "users/alice/uploads/x.jpg", type: "food" }), "bob");
    expect(ok.status).toBeLessThan(300);
  });

  it("validates the join body", async () => {
    expect((await call("/v1/household/join", req({}), "bob")).status).toBe(400);
  });
});
