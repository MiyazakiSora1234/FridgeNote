import type { MiddlewareHandler } from "hono";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ApiError } from "../lib/errors.js";
import { getHouseholdId } from "../services/householdService.js";

export type Bindings = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
};

export type AppEnv = { Bindings: Bindings; Variables: { userId: string; householdId: string } };

// JWT自体の検証はAPI Gateway側で完了済み。ここではクレーム取り出しのみ行い、
// クライアントが送ってくるbody/queryのuserIdは一切参照しない(なりすまし防止)。
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const claims = c.env.event.requestContext.authorizer?.jwt?.claims;
  const sub = claims?.sub;
  if (!sub || typeof sub !== "string") {
    throw new ApiError(401, "UNAUTHORIZED", "missing or invalid authentication token");
  }
  c.set("userId", sub);
  await next();
};

// 認可に使う世帯IDは必ずJWTのsubからサーバー側で解決する(クライアント送信値は信用しない)。
// 世帯に参加していなければ個人世帯(householdId = sub)として扱う。
export const resolveHousehold: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("householdId", await getHouseholdId(c.get("userId")));
  await next();
};
