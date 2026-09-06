import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validationErrorFromZod } from "../../src/lib/errors.js";

describe("validationErrorFromZod", () => {
  it("formats a single issue as 'field: message', not a raw JSON dump", () => {
    const schema = z.object({ quantity: z.number() });
    const result = schema.safeParse({ quantity: "not a number" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const err = validationErrorFromZod(result.error);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toContain("quantity");
    expect(err.message).not.toContain('"code"');
    expect(err.message).not.toContain("[");
  });

  it("joins multiple issues with a comma", () => {
    const schema = z.object({ name: z.string().min(1), quantity: z.number() });
    const result = schema.safeParse({ name: "", quantity: "x" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const err = validationErrorFromZod(result.error);
    expect(err.message).toContain("name");
    expect(err.message).toContain("quantity");
    expect(err.message).toContain(", ");
  });

  it("falls back to 'value' when the issue has no field path (top-level error)", () => {
    const schema = z.string();
    const result = schema.safeParse(123);
    expect(result.success).toBe(false);
    if (result.success) return;

    const err = validationErrorFromZod(result.error);
    expect(err.message).toContain("value:");
  });
});
