import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDdb } from "./fakeDynamo.js";

const fakeDdb = createFakeDdb();

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: fakeDdb,
  TABLE_NAME: "TestTable",
  isConditionalCheckFailed: (err: unknown) =>
    typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ConditionalCheckFailedException",
}));

vi.mock("../../src/services/s3.js", () => ({
  createUploadPresignedUrl: vi.fn(async (userId: string, contentType: string) => ({
    imageKey: `users/${userId}/uploads/fixed-id.jpg`,
    uploadUrl: "https://example-bucket.s3.amazonaws.com/signed",
    expiresIn: 60,
  })),
}));

const { app } = await import("../../src/app.js");

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
});

describe("POST /v1/images/presigned-url", () => {
  it("returns an upload URL scoped to the authenticated user", async () => {
    const res = await call(
      "/v1/images/presigned-url",
      jsonRequest({ contentType: "image/jpeg" }),
      authEnv("user-1"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.imageKey).toBe("users/user-1/uploads/fixed-id.jpg");
    expect(body.expiresIn).toBe(60);
  });

  it("rejects an unsupported content type", async () => {
    const res = await call(
      "/v1/images/presigned-url",
      jsonRequest({ contentType: "image/gif" }),
      authEnv("user-1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/analyses/:id", () => {
  it("returns the caller's own analysis", async () => {
    const env = authEnv("user-1");
    const created = await json(
      await call(
        "/v1/analyses",
        jsonRequest({ imageKey: "users/user-1/uploads/photo.jpg", type: "food" }),
        env,
      ),
    );

    const res = await call(`/v1/analyses/${created.analysisId}`, {}, env);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("pending");
    expect(body.type).toBe("food");
  });

  it("returns 404 (not 403) for another user's analysis, to avoid leaking existence", async () => {
    const owner = authEnv("user-1");
    const attacker = authEnv("user-2");
    const created = await json(
      await call(
        "/v1/analyses",
        jsonRequest({ imageKey: "users/user-1/uploads/photo.jpg", type: "food" }),
        owner,
      ),
    );

    const res = await call(`/v1/analyses/${created.analysisId}`, {}, attacker);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent analysisId", async () => {
    const res = await call("/v1/analyses/does-not-exist", {}, authEnv("user-1"));
    expect(res.status).toBe(404);
  });
});
