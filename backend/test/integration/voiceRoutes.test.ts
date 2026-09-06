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
});

describe("POST /v1/voice/transcriptions", () => {
  it("creates a pending voice analysis job scoped to the caller", async () => {
    const env = authEnv("user-1");
    const res = await call(
      "/v1/voice/transcriptions",
      jsonRequest({ audioKey: "users/user-1/audio/abc.m4a" }),
      env,
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.status).toBe("pending");
    expect(body.analysisId).toBeTruthy();
  });

  it("is idempotent for the same audioKey", async () => {
    const env = authEnv("user-1");
    const first = await json(
      await call("/v1/voice/transcriptions", jsonRequest({ audioKey: "users/user-1/audio/abc.m4a" }), env),
    );
    const second = await json(
      await call("/v1/voice/transcriptions", jsonRequest({ audioKey: "users/user-1/audio/abc.m4a" }), env),
    );
    expect(first.analysisId).toBe(second.analysisId);
  });

  it("rejects an audioKey that does not belong to the caller", async () => {
    const res = await call(
      "/v1/voice/transcriptions",
      jsonRequest({ audioKey: "users/someone-else/audio/abc.m4a" }),
      authEnv("user-1"),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /v1/voice/transcriptions/:id", () => {
  it("returns 404 for another user's voice analysis (not 403, to avoid leaking existence)", async () => {
    const owner = authEnv("user-1");
    const created = await json(
      await call("/v1/voice/transcriptions", jsonRequest({ audioKey: "users/user-1/audio/abc.m4a" }), owner),
    );

    const res = await call(`/v1/voice/transcriptions/${created.analysisId}`, {}, authEnv("user-2"));
    expect(res.status).toBe(404);
  });

  it("returns the job for its owner", async () => {
    const env = authEnv("user-1");
    const created = await json(
      await call("/v1/voice/transcriptions", jsonRequest({ audioKey: "users/user-1/audio/abc.m4a" }), env),
    );
    const res = await call(`/v1/voice/transcriptions/${created.analysisId}`, {}, env);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.audioKey).toBe("users/user-1/audio/abc.m4a");
  });
});
