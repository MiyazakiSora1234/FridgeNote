import { describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://example-bucket.s3.amazonaws.com/signed"),
}));

const { createUploadPresignedUrl } = await import("../../src/services/s3.js");

describe("createUploadPresignedUrl", () => {
  it("scopes the object key under the given userId, never a client-supplied one", async () => {
    const result = await createUploadPresignedUrl("user-123", "image/jpeg");
    expect(result.imageKey).toMatch(/^users\/user-123\/uploads\/[0-9A-Za-z]+\.jpg$/);
  });

  it("picks the file extension from the content type", async () => {
    const png = await createUploadPresignedUrl("user-123", "image/png");
    expect(png.imageKey).toMatch(/\.png$/);

    const webp = await createUploadPresignedUrl("user-123", "image/webp");
    expect(webp.imageKey).toMatch(/\.webp$/);
  });

  it("returns a short expiry so the presigned URL cannot be reused indefinitely", async () => {
    const result = await createUploadPresignedUrl("user-123", "image/jpeg");
    expect(result.expiresIn).toBeLessThanOrEqual(60);
  });

  it("generates a different imageKey for each call (no collisions)", async () => {
    const a = await createUploadPresignedUrl("user-123", "image/jpeg");
    const b = await createUploadPresignedUrl("user-123", "image/jpeg");
    expect(a.imageKey).not.toBe(b.imageKey);
  });
});
