import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { JoinHouseholdRequestSchema } from "../schemas/apiSchemas.js";
import { validationErrorFromZod } from "../lib/errors.js";
import {
  createInvite,
  getHousehold,
  joinHousehold,
  leaveHousehold,
  removeMember,
} from "../services/householdService.js";

export const householdRoute = new Hono<AppEnv>();

// userId(JWT sub)とhouseholdId(サーバー側で解決済み)のみを信用し、body/queryの値は使わない。
householdRoute.get("/", async (c) => {
  return c.json(await getHousehold(c.get("userId"), c.get("householdId")), 200);
});

householdRoute.post("/invites", async (c) => {
  return c.json(await createInvite(c.get("householdId")), 201);
});

householdRoute.post("/join", async (c) => {
  const body = JoinHouseholdRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  const householdId = await joinHousehold(userId, body.data.code, body.data.displayName);
  return c.json(await getHousehold(userId, householdId), 200);
});

householdRoute.post("/leave", async (c) => {
  await leaveHousehold(c.get("userId"), c.get("householdId"));
  return c.body(null, 204);
});

householdRoute.delete("/members/:userId", async (c) => {
  await removeMember(c.get("userId"), c.get("householdId"), c.req.param("userId"));
  return c.body(null, 204);
});
