import { ORPCError } from "@orpc/server";
import { batchSubmittedEmail, sendEmail } from "@roundcut/auth/email";
import { resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import { user } from "@roundcut/db/schema/auth";
import { client } from "@roundcut/db/schema/client";
import { comment } from "@roundcut/db/schema/comment";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, asc, count, desc, eq, isNull, ne } from "drizzle-orm";
import z from "zod";

import type { Notifications } from "../context";
import {
  publicProcedure,
  requireReviewLink,
  reviewerProcedure,
} from "../index";
import { reviewTokenSchema } from "../review-link";
import { isAllowedReviewer, reviewerIdentitySchema } from "../reviewer";
import type { FrameRate } from "../timecode";
import { findReviewVersion, requireReviewer } from "./comment";
import { thumbnailUrl } from "./version";

const versionInput = z.object({
  token: reviewTokenSchema,
  versionId: z.string().min(1),
});

const roundColumns = {
  id: round.id,
  number: round.number,
  status: round.status,
  submittedAt: round.submittedAt,
};

// The round reviewers comment in on a version: the latest one opened on it.
async function findVersionRound(db: Database, versionId: string) {
  const [current] = await db
    .select(roundColumns)
    .from(round)
    .where(eq(round.versionId, versionId))
    .orderBy(desc(round.number))
    .limit(1);
  return current ?? null;
}

// A round's batch is its top-level comments; replies follow their thread.
async function batchSize(db: Database, roundId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(comment)
    .where(and(eq(comment.roundId, roundId), isNull(comment.parentId)));
  return row?.total ?? 0;
}

// Top-level comments of a version written while no round was open on it:
// they wait for the next round (REV-06).
async function pendingSize(db: Database, versionId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(comment)
    .where(
      and(
        eq(comment.versionId, versionId),
        isNull(comment.roundId),
        isNull(comment.parentId)
      )
    );
  return row?.total ?? 0;
}

// Emails the workspace owner, in the workspace language, that a client
// submitted a batch. The submission is already saved: a mail failure is
// logged rather than reported to the client, who could not submit again.
async function notifyBatchSubmitted(
  db: Database,
  notifications: Notifications,
  batch: {
    count: number;
    projectId: string;
    reviewerName: string;
    roundNumber: number;
    versionId: string;
  }
) {
  const [row] = await db
    .select({
      deliverableTitle: deliverable.title,
      editorEmail: user.email,
      locale: workspace.locale,
      projectName: project.name,
      versionNumber: version.number,
    })
    .from(version)
    .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .innerJoin(user, eq(workspace.ownerUserId, user.id))
    .where(eq(version.id, batch.versionId));
  if (!row) {
    return;
  }
  try {
    await sendEmail(
      notifications.email,
      batchSubmittedEmail(resolveLocale(row.locale), row.editorEmail, {
        count: batch.count,
        deliverableTitle: row.deliverableTitle,
        projectName: row.projectName,
        reviewerName: batch.reviewerName,
        roundNumber: batch.roundNumber,
        url: `${notifications.appUrl}/projects/${batch.projectId}/versions/${batch.versionId}`,
        versionNumber: row.versionNumber,
      })
    );
  } catch (error) {
    console.error("Batch submitted email failed", error);
  }
}

export const reviewRouter = {
  // Clears the identity cookie so someone else can identify on this device.
  forgetIdentity: reviewerProcedure.handler(({ context }) => {
    context.reviewerCookies.clear(context.reviewLink.projectId);
  }),

  // First visit (REV-02): the reviewer gives a name and an email, which must
  // be on the client's whitelist when one is set. The identity is remembered
  // per project for 30 days by a signed cookie.
  identify: publicProcedure
    .input(reviewerIdentitySchema.extend({ token: reviewTokenSchema }))
    .use(requireReviewLink)
    .handler(async ({ context, input: { email, name } }) => {
      const { projectId } = context.reviewLink;
      if (!isAllowedReviewer(context.reviewerClient, email)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Email not allowed on this review link",
        });
      }
      const isDecider =
        email === context.reviewerClient.deciderEmail.toLowerCase();
      const [saved] = await context.db
        .insert(reviewer)
        .values({ email, isDecider, name, projectId })
        .onConflictDoUpdate({
          set: { isDecider, name },
          target: [reviewer.projectId, reviewer.email],
        })
        .returning({
          email: reviewer.email,
          id: reviewer.id,
          isDecider: reviewer.isDecider,
          name: reviewer.name,
        });
      if (!saved) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
      context.reviewerCookies.set(projectId, saved.id);
      return saved;
    }),

  // What the client sees through the link: the project's deliverables and,
  // for each, its latest published version with a short-lived playback URL
  // (signed again on every call). Nothing outside the linked project, and
  // only the project header until the reviewer has identified.
  resolveLink: reviewerProcedure.handler(async ({ context }) => {
    const { expiresAt, projectId } = context.reviewLink;
    const [row] = await context.db
      .select({
        clientName: client.name,
        name: project.name,
        workspaceName: workspace.name,
      })
      .from(project)
      .innerJoin(client, eq(project.clientId, client.id))
      .innerJoin(workspace, eq(project.workspaceId, workspace.id))
      .where(eq(project.id, projectId));
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
    }
    const header = {
      clientName: row.clientName,
      expiresAt,
      name: row.name,
      workspaceName: row.workspaceName,
    };
    if (!context.reviewer) {
      return { ...header, reviewer: null };
    }
    const deliverables = await context.db
      .select({
        aspect: deliverable.aspect,
        id: deliverable.id,
        title: deliverable.title,
      })
      .from(deliverable)
      .where(eq(deliverable.projectId, projectId))
      .orderBy(asc(deliverable.position));
    const published = await context.db
      .select({ deliverableId: version.deliverableId, version })
      .from(version)
      .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
      .where(
        and(
          eq(deliverable.projectId, projectId),
          ne(version.status, "uploading")
        )
      )
      .orderBy(asc(version.number));
    // Ascending order: the last version seen per deliverable is its latest.
    const latest = new Map(
      published.map((item) => [item.deliverableId, item.version])
    );
    return {
      ...header,
      deliverables: await Promise.all(
        deliverables.map(async (item) => {
          const current = latest.get(item.id);
          return {
            ...item,
            latestVersion: current
              ? {
                  durationMs: current.durationMs,
                  frameRate: current.fps as FrameRate | null,
                  id: current.id,
                  number: current.number,
                  playbackUrl: await context.storage.signGet(current.r2Key),
                  thumbnailUrl: await thumbnailUrl(
                    context.storage,
                    current.thumbnailKey
                  ),
                }
              : null,
          };
        })
      ),
      reviewer: context.reviewer,
    };
  }),
  // The review round of a version with the size of its batch, the comments
  // waiting for the next round (REV-06), the project's included rounds and
  // the decider's approval, for the reviewer's submit button (REV-05) and
  // permanent round banner (REV-07).
  round: publicProcedure
    .input(versionInput)
    .use(requireReviewLink)
    .handler(async ({ context, input: { versionId } }) => {
      requireReviewer(context.reviewer);
      const { projectId } = context.reviewLink;
      const target = await findReviewVersion(context.db, projectId, versionId);
      const [terms] = await context.db
        .select({ termsSnapshot: project.termsSnapshot })
        .from(project)
        .where(eq(project.id, projectId));
      const current = await findVersionRound(context.db, target.id);
      return {
        // Final approval (date and decider) is recorded by APPR-01 (#54).
        approval: null as { approvedAt: Date; approverName: string } | null,
        includedRounds: terms?.termsSnapshot.includedRounds ?? 0,
        pendingCount: await pendingSize(context.db, target.id),
        round: current
          ? {
              ...current,
              batchCount: await batchSize(context.db, current.id),
            }
          : null,
      };
    }),

  // The reviewer submits the feedback batch of the round open on a version
  // (REV-05): the round moves to submitted, later comments wait for the next
  // round, and the editor is emailed. Only one submission wins a race.
  submitBatch: publicProcedure
    .input(versionInput)
    .use(requireReviewLink)
    .handler(async ({ context, input: { versionId } }) => {
      const author = requireReviewer(context.reviewer);
      const { projectId } = context.reviewLink;
      const target = await findReviewVersion(context.db, projectId, versionId);
      const current = await findVersionRound(context.db, target.id);
      if (current?.status !== "open") {
        throw new ORPCError("CONFLICT", {
          message: "No open round to submit on this version",
        });
      }
      const total = await batchSize(context.db, current.id);
      if (total === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Add feedback before submitting",
        });
      }
      const [saved] = await context.db
        .update(round)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(and(eq(round.id, current.id), eq(round.status, "open")))
        .returning(roundColumns);
      if (!saved) {
        throw new ORPCError("CONFLICT", {
          message: "No open round to submit on this version",
        });
      }
      await notifyBatchSubmitted(context.db, context.notifications, {
        count: total,
        projectId,
        reviewerName: author.name,
        roundNumber: saved.number,
        versionId: target.id,
      });
      return { ...saved, count: total };
    }),
};
