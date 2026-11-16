import { ORPCError, os } from "@orpc/server";
import { client } from "@roundcut/db/schema/client";
import { project } from "@roundcut/db/schema/project";
import { reviewLink } from "@roundcut/db/schema/review-link";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { and, eq } from "drizzle-orm";
import z from "zod";

import type { Context } from "./context";
import {
  hashReviewToken,
  isReviewLinkExpired,
  reviewTokenSchema,
  sameTokenHash,
} from "./review-link";
import { isAllowedReviewer } from "./reviewer";

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
// apart so the client knows to ask the editor for a new one. The reviewer
// (REV-02) comes from the signed identity cookie of the project and is null
// until they identify, or once their email leaves the client's whitelist.
export const requireReviewLink = o.middleware(
  async ({ context, next }, input: { token: string }) => {
    const tokenHash = hashReviewToken(input.token);
    const [row] = await context.db
      .select({
        client: {
          deciderEmail: client.deciderEmail,
          reviewerEmails: client.reviewerEmails,
        },
        link: reviewLink,
      })
      .from(reviewLink)
      .innerJoin(project, eq(reviewLink.projectId, project.id))
      .innerJoin(client, eq(project.clientId, client.id))
      .where(eq(reviewLink.tokenHash, tokenHash));
    if (
      !(row && sameTokenHash(row.link.tokenHash, tokenHash)) ||
      row.link.revokedAt
    ) {
      throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
    }
    const { link } = row;
    if (isReviewLinkExpired(link)) {
      throw new ORPCError("LINK_EXPIRED", {
        message: "Review link expired",
        status: 410,
      });
    }
    const reviewerId = context.reviewerCookies.read(link.projectId);
    const [identified] = reviewerId
      ? await context.db
          .select({
            email: reviewer.email,
            id: reviewer.id,
            isDecider: reviewer.isDecider,
            name: reviewer.name,
          })
          .from(reviewer)
          .where(
            and(
              eq(reviewer.id, reviewerId),
              eq(reviewer.projectId, link.projectId)
            )
          )
      : [];
    return next({
      context: {
        reviewer:
          identified && isAllowedReviewer(row.client, identified.email)
            ? identified
            : null,
        reviewerClient: row.client,
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
