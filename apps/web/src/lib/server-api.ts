import { createRouterClient } from "@orpc/server";
import { createReviewerCookies } from "@roundcut/api/reviewer";
import { appRouter } from "@roundcut/api/routers/index";
import type { Session } from "@roundcut/auth";

import { db, notifications, reviewerCookieOptions, storage } from "@/services";

// Server Components call editor procedures only: no reviewer cookie to read
// and no response to set one on.
export const createServerApi = (session: Session) =>
  createRouterClient(appRouter, {
    context: {
      db,
      notifications,
      reviewerCookies: createReviewerCookies(
        reviewerCookieOptions,
        new Headers(),
        new Headers()
      ),
      session,
      storage,
    },
  });
