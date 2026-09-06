import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { IngredientSearchRequestSchema } from "../schemas/apiSchemas.js";
import { validationErrorFromZod } from "../lib/errors.js";
import { AliasIngredientSearchService } from "../services/ingredientSearchService.js";

export const ingredientsRoute = new Hono<AppEnv>();

const searchService = new AliasIngredientSearchService();

/**
 * 食材マスターの曖昧検索。手動入力時のサジェストや、将来的な確認画面での
 * 「似た食材」表示に使う想定。食材マスターはユーザー固有データではないため、
 * 認可上は「ログインさえしていれば誰でも検索可能」で問題ない
 * (ミドルウェアのrequireAuthで認証済みユーザーのみに制限されている)。
 */
ingredientsRoute.post("/search", async (c) => {
  const body = IngredientSearchRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const candidates = await searchService.search(body.data.query, body.data.limit);
  return c.json({ candidates }, 200);
});
