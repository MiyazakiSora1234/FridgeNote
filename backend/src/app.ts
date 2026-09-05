import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./middleware/auth.js";
import { requireAuth } from "./middleware/auth.js";
import { ApiError } from "./lib/errors.js";
import { imagesRoute } from "./routes/images.js";
import { analysesRoute } from "./routes/analyses.js";
import { fridgeRoute } from "./routes/fridge.js";

export const app = new Hono<AppEnv>();

app.use("*", cors());

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  console.error("unhandled error", err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "internal server error" } }, 500);
});

app.get("/v1/health", (c) => c.json({ ok: true }));

const v1 = new Hono<AppEnv>();
v1.use("*", requireAuth);
v1.route("/images", imagesRoute);
v1.route("/analyses", analysesRoute);
v1.route("/fridge", fridgeRoute);

app.route("/v1", v1);
