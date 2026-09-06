import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { IngredientSearchRequestSchema } from "../schemas/apiSchemas.js";
import { validationErrorFromZod } from "../lib/errors.js";
import { AliasIngredientSearchService } from "../services/ingredientSearchService.js";

export const ingredientsRoute = new Hono<AppEnv>();

const searchService = new AliasIngredientSearchService();

// requireAuthでログイン済みユーザーに限定済みのため、それ以上の認可制限は不要。
ingredientsRoute.post("/search", async (c) => {
  const body = IngredientSearchRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const candidates = await searchService.search(body.data.query, body.data.limit);
  return c.json({ candidates }, 200);
});
