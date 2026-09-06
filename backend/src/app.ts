import { Hono } from "hono";
import type { AppEnv } from "./middleware/auth.js";
import { requireAuth } from "./middleware/auth.js";
import { ApiError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { imagesRoute } from "./routes/images.js";
import { analysesRoute } from "./routes/analyses.js";
import { fridgeRoute } from "./routes/fridge.js";
import { voiceRoute } from "./routes/voice.js";
import { ingredientsRoute } from "./routes/ingredients.js";

// CORSはAPI Gateway側のcors_configuration(infra/apigateway.tf)だけで完結させる。
// ここでHonoのcors()も重ねると許可オリジンの設定元が2箇所に分散するため付けない。
export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof ApiError) {
    logger.warn("api_error", { err, path: c.req.path, method: c.req.method, code: err.code, status: err.status });
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  logger.error("unhandled_error", { err, path: c.req.path, method: c.req.method });
  return c.json({ error: { code: "INTERNAL_ERROR", message: "internal server error" } }, 500);
});

app.get("/v1/health", (c) => c.json({ ok: true }));

const v1 = new Hono<AppEnv>();
v1.use("*", requireAuth);
v1.route("/images", imagesRoute);
v1.route("/analyses", analysesRoute);
v1.route("/fridge", fridgeRoute);
v1.route("/voice", voiceRoute);
v1.route("/ingredients", ingredientsRoute);

app.route("/v1", v1);
