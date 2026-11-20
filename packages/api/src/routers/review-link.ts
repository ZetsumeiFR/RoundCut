import { ORPCError } from "@orpc/server";
import { reviewLinkEmail, sendEmail } from "@roundcut/auth/email";
import { resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import { client } from "@roundcut/db/schema/client";
import { project } from "@roundcut/db/schema/project";
import { reviewLink } from "@roundcut/db/schema/review-link";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, eq, isNull } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import {
  createReviewToken,
  hashReviewToken,
  isReviewLinkExpired,
  reviewLinkSchema,
  reviewTokenSchema,
  sameTokenHash,
} from "../review-link";
import { getOrCreateWorkspace } from "./workspace";

type ReviewLinkRow = typeof reviewLink.$inferSelect;

const toReviewLink = (row: ReviewLinkRow) => ({
  createdAt: row.createdAt,
  expired: isReviewLinkExpired(row),
  expiresAt: row.expiresAt,
  id: row.id,
});

const projectInput = z.object({ projectId: z.string().min(1) });

const activeLinkOf = (projectId: string) =>
  and(eq(reviewLink.projectId, projectId), isNull(reviewLink.revokedAt));

export async function findOwnedProject(
  db: Database,
  user: { id: string; name: string },
  projectId: string
) {
  const owner = await getOrCreateWorkspace(db, user);
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, owner.id)));
  // Other workspaces' projects read as missing so their ids leak nothing.
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" });
  }
  return row;
}

export const reviewLinkRouter = {
  // Revokes the current link, if any, and issues a new one. The token is
  // returned once: only its hash is stored.
  create: protectedProcedure
    .input(reviewLinkSchema)
    .handler(async ({ context, input: { expiresAt, projectId } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      const token = createReviewToken();
      const row = await context.db.transaction(async (tx) => {
        // Locking the project serializes concurrent regenerations, so the
        // project never ends up with two active links.
        await tx
          .select({ id: project.id })
          .from(project)
          .where(eq(project.id, owned.id))
          .for("update");
        await tx
          .update(reviewLink)
          .set({ revokedAt: new Date() })
          .where(activeLinkOf(owned.id));
        const [created] = await tx
          .insert(reviewLink)
          .values({
            expiresAt,
            projectId: owned.id,
            tokenHash: hashReviewToken(token),
          })
          .returning();
        if (!created) {
          throw new Error("Review link insert returned no row");
        }
        return created;
      });
      return { link: toReviewLink(row), token };
    }),
  get: protectedProcedure
    .input(projectInput)
    .handler(async ({ context, input: { projectId } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      const [row] = await context.db
        .select()
        .from(reviewLink)
        .where(activeLinkOf(owned.id));
      return row ? toReviewLink(row) : null;
    }),
  revoke: protectedProcedure
    .input(projectInput)
    .handler(async ({ context, input: { projectId } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      const revoked = await context.db
        .update(reviewLink)
        .set({ revokedAt: new Date() })
        .where(activeLinkOf(owned.id))
        .returning({ id: reviewLink.id });
      return { revoked: revoked.length > 0 };
    }),
  // Emails the link just generated (NOTIF-01) to the client's decider and
  // reviewers. Only the active link's hash is stored, so the token sent back
  // by the editor's dialog must match it.
  sendEmail: protectedProcedure
    .input(projectInput.extend({ token: reviewTokenSchema }))
    .handler(async ({ context, input: { projectId, token } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      const [row] = await context.db
        .select({
          deciderEmail: client.deciderEmail,
          expiresAt: reviewLink.expiresAt,
          locale: workspace.locale,
          projectName: project.name,
          reviewerEmails: client.reviewerEmails,
          studioName: workspace.name,
          timezone: workspace.timezone,
          tokenHash: reviewLink.tokenHash,
        })
        .from(reviewLink)
        .innerJoin(project, eq(reviewLink.projectId, project.id))
        .innerJoin(client, eq(project.clientId, client.id))
        .innerJoin(workspace, eq(project.workspaceId, workspace.id))
        .where(activeLinkOf(owned.id));
      if (!(row && sameTokenHash(row.tokenHash, hashReviewToken(token)))) {
        throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
      }
      if (isReviewLinkExpired(row)) {
        throw new ORPCError("CONFLICT", { message: "The review link expired" });
      }
      const locale = resolveLocale(row.locale);
      const details = {
        expiresOn: row.expiresAt
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeZone: row.timezone,
            }).format(row.expiresAt)
          : null,
        projectName: row.projectName,
        studioName: row.studioName,
        url: `${context.notifications.appUrl}/r/${token}`,
      };
      const recipients = [
        ...new Set([row.deciderEmail, ...row.reviewerEmails]),
      ];
      const results = await Promise.allSettled(
        recipients.map((to) =>
          sendEmail(
            context.notifications.email,
            reviewLinkEmail(locale, to, details)
          )
        )
      );
      const sent = recipients.filter(
        (_, index) => results[index]?.status === "fulfilled"
      );
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Review link email failed", result.reason);
        }
      }
      if (sent.length === 0) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Couldn't email the review link",
        });
      }
      return {
        failed: recipients.filter((to) => !sent.includes(to)),
        sent,
      };
    }),
  updateExpiry: protectedProcedure
    .input(reviewLinkSchema)
    .handler(async ({ context, input: { expiresAt, projectId } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      const [row] = await context.db
        .update(reviewLink)
        .set({ expiresAt })
        .where(activeLinkOf(owned.id))
        .returning();
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
      }
      return toReviewLink(row);
    }),
};
