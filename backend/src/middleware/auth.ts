import type { MiddlewareHandler } from "hono";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ApiError } from "../lib/errors.js";

export type Bindings = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
};

export type AppEnv = { Bindings: Bindings; Variables: { userId: string } };

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
