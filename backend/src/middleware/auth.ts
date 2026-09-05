import type { MiddlewareHandler } from "hono";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ApiError } from "../lib/errors.js";

export type Bindings = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
};

export type AppEnv = { Bindings: Bindings; Variables: { userId: string } };

/**
 * API Gateway HTTP API の JWT Authorizer が検証済みのCognito claimsから `sub` を取り出す。
 * JWT自体の検証(署名・有効期限)はAPI Gateway側で完了しているため、ここでは
 * クレームの取り出しと欠落チェックのみを行う。クライアントが別途送ってくる
 * body/queryのuserIdは一切参照しない(なりすまし防止)。
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const claims = c.env.event.requestContext.authorizer?.jwt?.claims;
  const sub = claims?.sub;
  if (!sub || typeof sub !== "string") {
    throw new ApiError(401, "UNAUTHORIZED", "missing or invalid authentication token");
  }
  c.set("userId", sub);
  await next();
};
