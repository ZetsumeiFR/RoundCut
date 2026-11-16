import type { Context as ApiContext } from "@roundcut/api/context";
import { createReviewerCookies } from "@roundcut/api/reviewer";
import type { NextRequest } from "next/server";

import {
  auth,
  db,
  notifications,
  reviewerCookieOptions,
  storage,
} from "./services";

export async function createContext(req: NextRequest): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  const resHeaders = new Headers();
  return {
    db,
    notifications,
    resHeaders,
    reviewerCookies: createReviewerCookies(
      reviewerCookieOptions,
      req.headers,
      resHeaders
    ),
    session,
    storage,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
