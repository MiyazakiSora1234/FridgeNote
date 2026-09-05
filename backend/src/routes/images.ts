import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { PresignedUrlRequestSchema } from "../schemas/apiSchemas.js";
import { validationErrorFromZod } from "../lib/errors.js";
import { createUploadPresignedUrl } from "../services/s3.js";

export const imagesRoute = new Hono<AppEnv>();

imagesRoute.post("/presigned-url", async (c) => {
  const body = PresignedUrlRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  const result = await createUploadPresignedUrl(userId, body.data.contentType);
  return c.json(result, 200);
});
