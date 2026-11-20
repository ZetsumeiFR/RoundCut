import { ORPCError } from "@orpc/server";
import {
  approvalCodeEmail,
  batchSubmittedEmail,
  extraRoundCodeEmail,
  sendEmail,
  versionApprovedEmail,
} from "@roundcut/auth/email";
import { LOCALES, resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import { PROJECT_AUTO_APPROVAL_SOURCES } from "@roundcut/db/project-status";
import {
  REVIEWER_CODE_PURPOSES,
  REVIEWER_CODE_RESEND_SECONDS,
  REVIEWER_CODE_VALIDITY_MINUTES,
} from "@roundcut/db/reviewer-code";
import { canGiftRound } from "@roundcut/db/round";
import { client } from "@roundcut/db/schema/client";
import { comment } from "@roundcut/db/schema/comment";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { extraRoundOffer } from "@roundcut/db/schema/extra-round-offer";
import { project } from "@roundcut/db/schema/project";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notExists,
} from "drizzle-orm";
import z from "zod";

import { certificateFile, findCertificate } from "../certificate";
import { consentShownSchema, snapshotHash } from "../consent";
import type { Notifications } from "../context";
import {
  publicProcedure,
  requireReviewLink,
  reviewerProcedure,
} from "../index";
import { notifyEditor, versionEditor } from "../notifications";
import { reviewTokenSchema } from "../review-link";
import {
  isAllowedReviewer,
  isDeciderEmail,
  reviewerIdentitySchema,
} from "../reviewer";
import {
  consumeReviewerCode,
  issueReviewerCode,
  reviewerCodeSchema,
} from "../reviewer-code";
import type { FrameRate } from "../timecode";
import { findReviewVersion, requireDecider, requireReviewer } from "./comment";
import { projectRoundPositions, roundTransition } from "./round";
import { thumbnailUrl } from "./version";
import { brandOf } from "./workspace";

const versionInput = z.object({
  token: reviewTokenSchema,
  versionId: z.string().min(1),
});

const roundColumns = {
  closedAt: round.closedAt,
  closedNote: round.closedNote,
  closedReason: round.closedReason,
  giftNote: round.giftNote,
  id: round.id,
  kind: round.kind,
  manualCloseReason: round.manualCloseReason,
  number: round.number,
  status: round.status,
  submittedAt: round.submittedAt,
};

// The round reviewers comment in on a version: the latest one opened on it.
export async function findVersionRound(db: Database, versionId: string) {
  const [current] = await db
    .select(roundColumns)
    .from(round)
    .where(eq(round.versionId, versionId))
    .orderBy(desc(round.number))
    .limit(1);
  return current ?? null;
}

// The decider's approval of a version (EXTRA-06), from its agreement record.
async function versionApproval(db: Database, versionId: string) {
  const [record] = await db
    .select({
      approvedAt: consentRecord.createdAt,
      approverName: consentRecord.name,
    })
    .from(consentRecord)
    .where(
      and(
        eq(consentRecord.versionId, versionId),
        eq(consentRecord.kind, "approval")
      )
    );
  return record ?? null;
}

// The deliverable's latest published version: the one the client reviews
// and the only one they can approve.
async function latestVersionNumber(db: Database, deliverableId: string) {
  const [latest] = await db
    .select({ number: version.number })
    .from(version)
    .where(
      and(
        eq(version.deliverableId, deliverableId),
        ne(version.status, "uploading")
      )
    )
    .orderBy(desc(version.number))
    .limit(1);
  return latest?.number ?? null;
}

// A round's batch is its top-level comments; replies follow their thread.
export async function batchSize(db: Database, roundId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(comment)
    .where(and(eq(comment.roundId, roundId), isNull(comment.parentId)));
  return row?.total ?? 0;
}

// Top-level comments of a version written while no round was open on it:
// they wait for the next round (REV-06).
export async function pendingSize(db: Database, versionId: string) {
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

// Emails the editor that a client submitted a batch. The submission is
// already saved: a mail failure is logged rather than reported to the client,
// who could not submit again.
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
  const row = await versionEditor(db, batch.versionId);
  if (!row) {
    return;
  }
  await notifyEditor(db, row, "batch_submitted", [
    { actorName: batch.reviewerName, roundNumber: batch.roundNumber },
  ]);
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

// Emails the editor that the decider approved a version (APPR-01). The
// approval is already sealed: a mail failure is only logged.
async function notifyVersionApproved(
  db: Database,
  notifications: Notifications,
  approval: {
    approverName: string;
    projectId: string;
    snapshotHash: string;
    versionId: string;
  }
) {
  const row = await versionEditor(db, approval.versionId);
  if (!row) {
    return;
  }
  await notifyEditor(db, row, "version_approved", [
    { actorName: approval.approverName },
  ]);
  try {
    await sendEmail(
      notifications.email,
      versionApprovedEmail(resolveLocale(row.locale), row.editorEmail, {
        approverName: approval.approverName,
        deliverableTitle: row.deliverableTitle,
        projectName: row.projectName,
        snapshotHash: approval.snapshotHash,
        url: `${notifications.appUrl}/projects/${approval.projectId}/versions/${approval.versionId}`,
        versionNumber: row.versionNumber,
      })
    );
  } catch (error) {
    console.error("Version approved email failed", error);
  }
}

export const reviewRouter = {
  // The validation certificate (APPR-04) of an approved version, for any
  // identified reviewer of the link.
  approvalCertificate: publicProcedure
    .input(versionInput.extend({ locale: z.enum(LOCALES) }))
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      requireReviewer(context.reviewer);
      const certificate = await findCertificate(
        context.db,
        and(
          eq(consentRecord.versionId, input.versionId),
          eq(consentRecord.projectId, context.reviewLink.projectId)
        )
      );
      return certificateFile(certificate, input.locale);
    }),
  // The decider approves the version they review with an email code
  // (APPR-01, also offered after declining an extra round in EXTRA-06): the
  // version and its deliverable turn approved, the version's round closes
  // as approved, the agreement record (kind "approval", one per version)
  // seals who approved what, when and from where, with the text shown, and
  // the editor is emailed. Approving the last deliverable approves the
  // project (APPR-03).
  approveVersion: publicProcedure
    .input(
      versionInput.extend({
        agreed: z.literal(true),
        code: reviewerCodeSchema,
        shown: consentShownSchema,
      })
    )
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const { projectId } = context.reviewLink;
      const target = await findReviewVersion(
        context.db,
        projectId,
        input.versionId
      );
      const conflict = new ORPCError("CONFLICT", {
        message: "Only the latest version, not yet approved, can be approved",
      });
      if (
        target.status !== "ready" ||
        (await latestVersionNumber(context.db, target.deliverableId)) !==
          target.number
      ) {
        throw conflict;
      }
      await consumeReviewerCode(context.db, decider.id, "approval", input.code);
      const [row] = await context.db
        .select({
          deliverableTitle: deliverable.title,
          projectName: project.name,
          workspaceName: workspace.name,
        })
        .from(deliverable)
        .innerJoin(project, eq(deliverable.projectId, project.id))
        .innerJoin(workspace, eq(project.workspaceId, workspace.id))
        .where(eq(deliverable.id, target.deliverableId));
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Version not found" });
      }
      // Versions published before APPR-04 are fingerprinted when approved.
      const sha256 =
        target.sha256 ?? (await context.storage.sha256(target.r2Key));
      const now = new Date();
      const snapshot = {
        approvedAt: now.toISOString(),
        kind: "approval",
        project: {
          deliverable: {
            id: target.deliverableId,
            title: row.deliverableTitle,
          },
          id: projectId,
          name: row.projectName,
          version: {
            fileName: target.fileName,
            id: target.id,
            number: target.number,
            sha256,
            sizeBytes: target.sizeBytes,
          },
          workspace: row.workspaceName,
        },
        request: {
          ip: context.request.ip,
          userAgent: context.request.userAgent,
        },
        shown: input.shown,
        signer: {
          email: decider.email,
          name: decider.name,
          reviewerId: decider.id,
        },
        snapshotVersion: 1,
      };
      const approving = roundTransition("approve", now);
      const record = await context.db.transaction(async (tx) => {
        // Approvals of one project run one at a time, so the approval of its
        // last deliverables always sees the others and approves the project.
        await tx
          .select({ id: project.id })
          .from(project)
          .where(eq(project.id, projectId))
          .for("update");
        const [approved] = await tx
          .update(version)
          .set({ sha256, status: "approved" })
          .where(and(eq(version.id, target.id), eq(version.status, "ready")))
          .returning({ id: version.id });
        if (!approved) {
          throw conflict;
        }
        const [saved] = await tx
          .insert(consentRecord)
          .values({
            createdAt: now,
            email: decider.email,
            ip: context.request.ip,
            kind: "approval",
            name: decider.name,
            projectId,
            reviewerId: decider.id,
            snapshot,
            snapshotHash: snapshotHash(snapshot),
            userAgent: context.request.userAgent,
            versionId: target.id,
          })
          .returning({
            approvedAt: consentRecord.createdAt,
            approverName: consentRecord.name,
            snapshotHash: consentRecord.snapshotHash,
          });
        await tx
          .update(round)
          .set(approving.set)
          .where(and(eq(round.versionId, target.id), approving.guard));
        await tx
          .update(deliverable)
          .set({ status: "approved" })
          .where(eq(deliverable.id, target.deliverableId));
        await tx
          .update(reviewer)
          .set({ verifiedAt: now })
          .where(eq(reviewer.id, decider.id));
        const [completed] = await tx
          .update(project)
          .set({ status: "approved" })
          .where(
            and(
              eq(project.id, projectId),
              inArray(project.status, PROJECT_AUTO_APPROVAL_SOURCES),
              notExists(
                tx
                  .select({ id: deliverable.id })
                  .from(deliverable)
                  .where(
                    and(
                      eq(deliverable.projectId, projectId),
                      ne(deliverable.status, "approved")
                    )
                  )
              )
            )
          )
          .returning({ id: project.id });
        return saved && { ...saved, projectApproved: Boolean(completed) };
      });
      if (!record) {
        throw conflict;
      }
      await notifyVersionApproved(context.db, context.notifications, {
        approverName: record.approverName,
        projectId,
        snapshotHash: record.snapshotHash,
        versionId: target.id,
      });
      return record;
    }),
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
      const isDecider = isDeciderEmail(context.reviewerClient, email);
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

  // Emails the decider a 6-digit code to type with their agreement
  // (EXTRA-02), in the workspace language. Asking again within a minute is
  // refused; a new code replaces the previous one.
  requestOtp: publicProcedure
    .input(
      z.object({
        purpose: z.enum(REVIEWER_CODE_PURPOSES),
        token: reviewTokenSchema,
      })
    )
    .use(requireReviewLink)
    .handler(async ({ context, input: { purpose } }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const [row] = await context.db
        .select({
          locale: workspace.locale,
          projectName: project.name,
          studioName: workspace.name,
        })
        .from(project)
        .innerJoin(workspace, eq(project.workspaceId, workspace.id))
        .where(eq(project.id, context.reviewLink.projectId));
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
      }
      const code = await issueReviewerCode(context.db, decider.id, purpose);
      const codeEmail =
        purpose === "approval" ? approvalCodeEmail : extraRoundCodeEmail;
      await sendEmail(
        context.notifications.email,
        codeEmail(resolveLocale(row.locale), decider.email, {
          code,
          projectName: row.projectName,
          reviewerName: decider.name,
          studioName: row.studioName,
          validityMinutes: REVIEWER_CODE_VALIDITY_MINUTES,
        })
      );
      return {
        email: decider.email,
        resendInSeconds: REVIEWER_CODE_RESEND_SECONDS,
      };
    }),

  // What the client sees through the link: the project's deliverables and,
  // for each, its latest published version with a short-lived playback URL
  // (signed again on every call). Nothing outside the linked project, and
  // only the project header until the reviewer has identified.
  resolveLink: reviewerProcedure.handler(async ({ context }) => {
    const { expiresAt, projectId } = context.reviewLink;
    const [row] = await context.db
      .select({
        brandAccentColor: workspace.brandAccentColor,
        brandLogoKey: workspace.brandLogoKey,
        clientName: client.name,
        name: project.name,
        plan: workspace.plan,
        status: project.status,
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
      brand: await brandOf(context.storage, row),
      clientName: row.clientName,
      expiresAt,
      name: row.name,
      status: row.status,
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
                  status: current.status,
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
      const positions = await projectRoundPositions(context.db, projectId);
      // The agreement that granted the round, whose receipt the client can
      // download once the offer itself is settled (EXTRA-07).
      const [agreed] = current
        ? await context.db
            .select({ offerId: extraRoundOffer.id })
            .from(extraRoundOffer)
            .where(eq(extraRoundOffer.roundId, current.id))
        : [];
      return {
        approval: await versionApproval(context.db, target.id),
        includedRounds: terms?.termsSnapshot.includedRounds ?? 0,
        pendingCount: await pendingSize(context.db, target.id),
        round: current
          ? {
              ...current,
              agreementOfferId: agreed?.offerId ?? null,
              batchCount: await batchSize(context.db, current.id),
              position: positions.get(current.id) ?? current.number,
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
      // A round beyond the included ones waits for the extra round agreement
      // (EXTRA-01, §7.1) or the editor's gift (ROUND-06): its comments are
      // kept, but it can't be submitted yet.
      const [terms] = await context.db
        .select({ termsSnapshot: project.termsSnapshot })
        .from(project)
        .where(eq(project.id, projectId));
      const position = (await projectRoundPositions(context.db, projectId)).get(
        current.id
      );
      if (
        canGiftRound(
          { ...current, position: position ?? current.number },
          terms?.termsSnapshot.includedRounds ?? 0
        )
      ) {
        throw new ORPCError("CONFLICT", {
          message: "This round needs the extra round agreement first",
        });
      }
      const total = await batchSize(context.db, current.id);
      if (total === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Add feedback before submitting",
        });
      }
      const submitting = roundTransition("submit");
      const [saved] = await context.db
        .update(round)
        .set(submitting.set)
        .where(and(eq(round.id, current.id), submitting.guard))
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
        roundNumber:
          (await projectRoundPositions(context.db, projectId)).get(saved.id) ??
          saved.number,
        versionId: target.id,
      });
      return { ...saved, count: total };
    }),
};
