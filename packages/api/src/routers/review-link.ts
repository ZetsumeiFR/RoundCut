import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import { project } from "@roundcut/db/schema/project";
import { reviewLink } from "@roundcut/db/schema/review-link";
import { and, eq, isNull } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import {
  createReviewToken,
  hashReviewToken,
  isReviewLinkExpired,
  reviewLinkSchema,
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

async function findOwnedProject(
  db: Database,
  user: { id: string; name: string },
  projectId: string
) {
  const workspace = await getOrCreateWorkspace(db, user);
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(eq(project.id, projectId), eq(project.workspaceId, workspace.id))
    );
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
