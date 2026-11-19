import type {
  Context as ApiContext,
  RequestOrigin,
} from "@roundcut/api/context";
import { createReviewerCookies } from "@roundcut/api/reviewer";
import type { NextRequest } from "next/server";

import {
  auth,
  db,
  notifications,
  reviewerCookieOptions,
  storage,
  stripe,
} from "./services";

// The client's address as forwarded by the proxy in front of the app (the
// same source Better-Auth's rate limit uses), and its user-agent.
function requestOrigin(headers: Headers): RequestOrigin {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent"),
  };
}

export async function createContext(req: NextRequest): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  const resHeaders = new Headers();
  return {
    db,
    notifications,
    request: requestOrigin(req.headers),
    resHeaders,
    reviewerCookies: createReviewerCookies(
      reviewerCookieOptions,
      req.headers,
      resHeaders
    ),
    session,
    storage,
    stripe,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
