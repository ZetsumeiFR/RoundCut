import {
  awaitingFeedbackEmail,
  type EmailConfig,
  sendEmail,
  unsubmittedFeedbackEmail,
} from "@roundcut/auth/email";
import { resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import type { ProjectStatus } from "@roundcut/db/project-status";
import { client } from "@roundcut/db/schema/client";
import { comment } from "@roundcut/db/schema/comment";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { reviewLink } from "@roundcut/db/schema/review-link";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import {
  and,
  count,
  eq,
  exists,
  gt,
  isNull,
  lt,
  not,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { isAllowedReviewer } from "./reviewer";
import { DECIDER_REMINDER_MAX_SENDS } from "./workspace";

// The client has nothing left to send on these projects.
export const FINISHED_PROJECT_STATUSES: ProjectStatus[] = [
  "approved",
  "archived",
];

// The project still has a review link the client can open.
export const activeReviewLink = (db: Database) =>
  exists(
    db
      .select({ id: reviewLink.id })
      .from(reviewLink)
      .where(
        and(
          eq(reviewLink.projectId, project.id),
          isNull(reviewLink.revokedAt),
          or(isNull(reviewLink.expiresAt), gt(reviewLink.expiresAt, sql`now()`))
        )
      )
  );

// "You have unsubmitted feedback" (ROUND-04): emails each reviewer whose
// comments on an open round still wait to be submitted, once the workspace's
// delay has passed since their last one. A reviewer is reminded once per
// burst of comments: a comment written after the reminder arms the next one.
// Run by the scheduled job; times are compared in the database.
export async function sendUnsubmittedFeedbackReminders(
  db: Database,
  email: EmailConfig
) {
  const lastCommentAt = sql`max(${comment.createdAt})`;
  const due = await db
    .select({
      count: count(comment.id),
      deciderEmail: client.deciderEmail,
      email: reviewer.email,
      locale: workspace.locale,
      name: reviewer.name,
      projectName: project.name,
      reviewerEmails: client.reviewerEmails,
      reviewerId: reviewer.id,
      // As text, to match the stored value exactly when claiming the row.
      sentAt: sql<
        string | null
      >`${reviewer.unsubmittedReminderSentAt}::text`.as("sent_at"),
      studioName: workspace.name,
    })
    .from(comment)
    .innerJoin(round, eq(comment.roundId, round.id))
    .innerJoin(reviewer, eq(comment.reviewerId, reviewer.id))
    .innerJoin(project, eq(reviewer.projectId, project.id))
    .innerJoin(client, eq(project.clientId, client.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(
      and(
        eq(comment.authorType, "reviewer"),
        isNull(comment.parentId),
        eq(round.status, "open"),
        eq(workspace.reviewerReminderEnabled, true),
        notInArray(project.status, FINISHED_PROJECT_STATUSES),
        activeReviewLink(db)
      )
    )
    .groupBy(reviewer.id, project.id, client.id, workspace.id)
    .having(
      and(
        sql`${lastCommentAt} <= now() - make_interval(hours => ${workspace.reviewerReminderHours})`,
        or(
          isNull(reviewer.unsubmittedReminderSentAt),
          sql`${reviewer.unsubmittedReminderSentAt} < ${lastCommentAt}`
        )
      )
    );

  const remind = async (row: (typeof due)[number]) => {
    if (
      !isAllowedReviewer(
        { deciderEmail: row.deciderEmail, reviewerEmails: row.reviewerEmails },
        row.email
      )
    ) {
      return "skipped";
    }
    // Claims the reminder first so overlapping runs never send it twice.
    const [claimed] = await db
      .update(reviewer)
      .set({ unsubmittedReminderSentAt: sql`now()` })
      .where(
        and(
          eq(reviewer.id, row.reviewerId),
          sql`${reviewer.unsubmittedReminderSentAt} is not distinct from ${row.sentAt}::timestamp`
        )
      )
      .returning({ id: reviewer.id });
    if (!claimed) {
      return "skipped";
    }
    try {
      await sendEmail(
        email,
        unsubmittedFeedbackEmail(resolveLocale(row.locale), row.email, {
          count: row.count,
          projectName: row.projectName,
          reviewerName: row.name,
          studioName: row.studioName,
        })
      );
      return "sent";
    } catch (error) {
      // Releases the claim so the next run tries again.
      await db
        .update(reviewer)
        .set({ unsubmittedReminderSentAt: sql`${row.sentAt}::timestamp` })
        .where(eq(reviewer.id, row.reviewerId));
      console.error("Unsubmitted feedback reminder failed", error);
      return "failed";
    }
  };

  const outcomes = await Promise.all(due.map(remind));
  return {
    due: due.length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
  };
}

// "Version awaiting your feedback" (ROUND-05): emails the client's decider
// when a round is still open, without any comment from them, the workspace's
// delay after it opened, then once more after the same delay since the
// previous reminder: at most DECIDER_REMINDER_MAX_SENDS per round. Run by the
// scheduled job; times are compared in the database.
export async function sendAwaitingFeedbackReminders(
  db: Database,
  email: EmailConfig
) {
  const deciderComment = db
    .select({ id: comment.id })
    .from(comment)
    .innerJoin(reviewer, eq(comment.reviewerId, reviewer.id))
    .where(and(eq(comment.roundId, round.id), eq(reviewer.isDecider, true)));
  const due = await db
    .select({
      count: round.deciderReminderCount,
      deciderEmail: client.deciderEmail,
      deciderName: client.deciderName,
      deliverableTitle: deliverable.title,
      locale: workspace.locale,
      projectName: project.name,
      roundId: round.id,
      // As text, to restore the stored value exactly if the email fails.
      sentAt: sql<string | null>`${round.deciderReminderSentAt}::text`.as(
        "sent_at"
      ),
      studioName: workspace.name,
      versionNumber: version.number,
    })
    .from(round)
    .innerJoin(version, eq(round.versionId, version.id))
    .innerJoin(deliverable, eq(round.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(client, eq(project.clientId, client.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(
      and(
        eq(round.status, "open"),
        lt(round.deciderReminderCount, DECIDER_REMINDER_MAX_SENDS),
        sql`coalesce(${round.deciderReminderSentAt}, ${round.openedAt}) <= now() - make_interval(days => ${workspace.deciderReminderDays})`,
        eq(workspace.deciderReminderEnabled, true),
        notInArray(project.status, FINISHED_PROJECT_STATUSES),
        activeReviewLink(db),
        not(exists(deciderComment))
      )
    );

  const remind = async (row: (typeof due)[number]) => {
    // Claims the reminder first so overlapping runs never send it twice.
    const [claimed] = await db
      .update(round)
      .set({
        deciderReminderCount: row.count + 1,
        deciderReminderSentAt: sql`now()`,
      })
      .where(
        and(
          eq(round.id, row.roundId),
          eq(round.status, "open"),
          eq(round.deciderReminderCount, row.count)
        )
      )
      .returning({ id: round.id });
    if (!claimed) {
      return "skipped";
    }
    try {
      await sendEmail(
        email,
        awaitingFeedbackEmail(resolveLocale(row.locale), row.deciderEmail, {
          deciderName: row.deciderName,
          deliverableTitle: row.deliverableTitle,
          projectName: row.projectName,
          studioName: row.studioName,
          versionNumber: row.versionNumber,
        })
      );
      return "sent";
    } catch (error) {
      // Releases the claim so the next run tries again.
      await db
        .update(round)
        .set({
          deciderReminderCount: row.count,
          deciderReminderSentAt: sql`${row.sentAt}::timestamp`,
        })
        .where(eq(round.id, row.roundId));
      console.error("Awaiting feedback reminder failed", error);
      return "failed";
    }
  };

  const outcomes = await Promise.all(due.map(remind));
  return {
    due: due.length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
  };
}
