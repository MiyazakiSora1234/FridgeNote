import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { CreateVoiceTranscriptionRequestSchema } from "../schemas/apiSchemas.js";
import { ForbiddenError, validationErrorFromZod } from "../lib/errors.js";
import { createVoiceAnalysis, getVoiceAnalysis } from "../services/voiceAnalysisService.js";

export const voiceRoute = new Hono<AppEnv>();

voiceRoute.post("/transcriptions", async (c) => {
  const body = CreateVoiceTranscriptionRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  if (!body.data.audioKey.startsWith(`users/${userId}/audio/`)) {
    throw ForbiddenError("audioKey does not belong to the authenticated user");
  }

  const result = await createVoiceAnalysis(userId, body.data.audioKey);
  return c.json({ analysisId: result.analysisId, status: result.status }, 201);
});

voiceRoute.get("/transcriptions/:id", async (c) => {
  const userId = c.get("userId");
  const analysis = await getVoiceAnalysis(userId, c.req.param("id"));
  return c.json(analysis, 200);
});
