import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { CreateAnalysisRequestSchema } from "../schemas/apiSchemas.js";
import { ForbiddenError, validationErrorFromZod } from "../lib/errors.js";
import { createAnalysis, getAnalysis } from "../services/analysisService.js";

export const analysesRoute = new Hono<AppEnv>();

analysesRoute.post("/", async (c) => {
  const body = CreateAnalysisRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  if (!body.data.imageKey.startsWith(`users/${userId}/uploads/`)) {
    throw ForbiddenError("imageKey does not belong to the authenticated user");
  }

  const result = await createAnalysis(userId, body.data.imageKey, body.data.type);
  return c.json({ analysisId: result.analysisId, status: result.status }, 201);
});

analysesRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const analysis = await getAnalysis(userId, c.req.param("id"));
  return c.json(analysis, 200);
});
