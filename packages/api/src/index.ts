import { ORPCError, os } from "@orpc/server";
import { reviewLink } from "@roundcut/db/schema/review-link";
import { eq } from "drizzle-orm";
import z from "zod";

import type { Context } from "./context";
import {
  hashReviewToken,
  isReviewLinkExpired,
  reviewTokenSchema,
  sameTokenHash,
} from "./review-link";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  if (!context.session.user.emailVerified) {
    throw new ORPCError("FORBIDDEN", { message: "Email not verified" });
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// Resolves the review link (REV-01) from its token. Unknown and revoked
// tokens read the same so a guess learns nothing; an expired link is told
// apart so the client knows to ask the editor for a new one.
export const requireReviewLink = o.middleware(
  async ({ context, next }, input: { token: string }) => {
    const tokenHash = hashReviewToken(input.token);
    const [link] = await context.db
      .select()
      .from(reviewLink)
      .where(eq(reviewLink.tokenHash, tokenHash));
    if (!(link && sameTokenHash(link.tokenHash, tokenHash)) || link.revokedAt) {
      throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
    }
    if (isReviewLinkExpired(link)) {
      throw new ORPCError("LINK_EXPIRED", {
        message: "Review link expired",
        status: 410,
      });
    }
    return next({
      context: {
        reviewLink: {
          expiresAt: link.expiresAt,
          id: link.id,
          projectId: link.projectId,
        },
      },
    });
  }
);

export const reviewerProcedure = publicProcedure
  .input(z.object({ token: reviewTokenSchema }))
  .use(requireReviewLink);
