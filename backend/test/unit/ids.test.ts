import { describe, expect, it } from "vitest";
import { deterministicIdFromKey } from "../../src/lib/ids.js";
import { userIdFromImageKey } from "../../src/services/analysisService.js";

describe("deterministicIdFromKey", () => {
  it("is deterministic for the same key", () => {
    const key = "users/user-1/uploads/abc.jpg";
    expect(deterministicIdFromKey(key)).toBe(deterministicIdFromKey(key));
  });

  it("differs between different keys", () => {
    expect(deterministicIdFromKey("users/user-1/uploads/a.jpg")).not.toBe(
      deterministicIdFromKey("users/user-1/uploads/b.jpg"),
    );
  });
});

describe("userIdFromImageKey", () => {
  it("extracts the userId segment", () => {
    expect(userIdFromImageKey("users/abc-123/uploads/uuid.jpg")).toBe("abc-123");
  });

  it("returns null for an unexpected key shape", () => {
    expect(userIdFromImageKey("some/other/path.jpg")).toBeNull();
  });
});
