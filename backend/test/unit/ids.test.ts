import { describe, expect, it } from "vitest";
import { analysisIdFromImageKey } from "../../src/lib/ids.js";
import { userIdFromImageKey } from "../../src/services/analysisService.js";

describe("analysisIdFromImageKey", () => {
  it("is deterministic for the same imageKey", () => {
    const key = "users/user-1/uploads/abc.jpg";
    expect(analysisIdFromImageKey(key)).toBe(analysisIdFromImageKey(key));
  });

  it("differs between different imageKeys", () => {
    expect(analysisIdFromImageKey("users/user-1/uploads/a.jpg")).not.toBe(
      analysisIdFromImageKey("users/user-1/uploads/b.jpg"),
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
