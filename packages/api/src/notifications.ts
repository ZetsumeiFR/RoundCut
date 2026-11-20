import {
  type DigestComment,
  type EmailConfig,
  editorDigestEmail,
  reviewerDigestEmail,
  sendEmail,
} from "@roundcut/auth/email";
import { resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import {
  type NotificationPayload,
  type NotificationType,
  notificationExcerpt,
} from "@roundcut/db/notification";
import { user } from "@roundcut/db/schema/auth";
import { client } from "@roundcut/db/schema/client";
import { comment } from "@roundcut/db/schema/comment";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { notification } from "@roundcut/db/schema/notification";
import { project } from "@roundcut/db/schema/project";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Notifications } from "./context";
import { activeReviewLink, FINISHED_PROJECT_STATUSES } from "./reminders";
import { isAllowedReviewer } from "./reviewer";

// The editor to tell about a client's move on a version: the workspace owner,
// written to in the workspace language.
export async function versionEditor(db: Database, versionId: string) {
  const [row] = await db
    .select({
      deliverableTitle: deliverable.title,
      editorEmail: user.email,
      editorId: user.id,
      locale: workspace.locale,
      projectId: project.id,
      projectName: project.name,
      versionId: version.id,
      versionNumber: version.number,
    })
    .from(version)
    .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .innerJoin(user, eq(workspace.ownerUserId, user.id))
    .where(eq(version.id, versionId));
  return row ?? null;
}

export type VersionEditor = NonNullable<
  Awaited<ReturnType<typeof versionEditor>>
>;

type EventDetails = Pick<
  NotificationPayload,
  "actorName" | "body" | "reply" | "roundNumber" | "timecodeMs"
>;

// Records events of a version for its editor (NOTIF-01). The client's move
// is already saved: a failure is logged, never reported to the client.
export async function notifyEditor(
  db: Database,
  editor: VersionEditor,
  type: NotificationType,
  events: EventDetails[]
) {
  if (events.length === 0) {
    return;
  }
  try {
    await db.insert(notification).values(
      events.map((event) => ({
        payload: {
          ...event,
          body:
            event.body === undefined
              ? undefined
              : notificationExcerpt(event.body),
          deliverableTitle: editor.deliverableTitle,
          projectId: editor.projectId,
          projectName: editor.projectName,
          versionId: editor.versionId,
          versionNumber: editor.versionNumber,
        },
        type,
        userId: editor.editorId,
      }))
    );
  } catch (error) {
    console.error("Notification insert failed", error);
  }
}

export async function notifyVersionEditor(
  db: Database,
  versionId: string,
  type: NotificationType,
  events: EventDetails[]
) {
  const editor = await versionEditor(db, versionId);
  if (editor) {
    await notifyEditor(db, editor, type, events);
  }
}

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

// "1:02:41" or "02:41": where a comment sits in the video.
const clock = (ms: number) => {
  const total = Math.floor(ms / MS_PER_SECOND);
  const hours = Math.floor(total / (SECONDS_PER_MINUTE * SECONDS_PER_MINUTE));
  const minutes = Math.floor(total / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;
  const seconds = String(total % SECONDS_PER_MINUTE).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${String(minutes).padStart(2, "0")}:${seconds}`;
};

const where = (item: {
  deliverableTitle: string;
  timecodeMs?: number | null;
  versionNumber: number;
}) =>
  `${item.deliverableTitle} V${item.versionNumber}${item.timecodeMs === undefined || item.timecodeMs === null ? "" : ` · ${clock(item.timecodeMs)}`}`;

interface DigestRun {
  due: number;
  failed: number;
  sent: number;
}

const tally = (outcomes: ("failed" | "sent" | "skipped")[]): DigestRun => ({
  due: outcomes.length,
  failed: outcomes.filter((outcome) => outcome === "failed").length,
  sent: outcomes.filter((outcome) => outcome === "sent").length,
});

const groupBy = <T>(items: T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return [...groups.values()];
};

// The editor's grouped email: every comment notification not emailed yet,
// one email per editor and project. Rows are claimed before sending so
// overlapping runs never send them twice, and released if the email fails.
async function sendEditorDigests(db: Database, notifications: Notifications) {
  const due = await db
    .select({
      email: user.email,
      id: notification.id,
      locale: workspace.locale,
      payload: notification.payload,
      userId: notification.userId,
    })
    .from(notification)
    .innerJoin(user, eq(notification.userId, user.id))
    .innerJoin(workspace, eq(workspace.ownerUserId, user.id))
    .where(
      and(eq(notification.type, "comment"), isNull(notification.emailedAt))
    )
    .orderBy(asc(notification.createdAt));

  const send = async (rows: typeof due) => {
    const [first] = rows;
    if (!first) {
      return "skipped";
    }
    const claimed = await db
      .update(notification)
      .set({ emailedAt: sql`now()` })
      .where(
        and(
          inArray(
            notification.id,
            rows.map((row) => row.id)
          ),
          isNull(notification.emailedAt)
        )
      )
      .returning({ id: notification.id });
    const ids = new Set(claimed.map((row) => row.id));
    const items = rows.filter((row) => ids.has(row.id));
    if (items.length === 0) {
      return "skipped";
    }
    try {
      await sendEmail(
        notifications.email,
        editorDigestEmail(resolveLocale(first.locale), first.email, {
          items: items.map(
            ({ payload }): DigestComment => ({
              authorName: payload.actorName,
              body: payload.body ?? "",
              kind: payload.reply ? "reply" : "comment",
              where: where(payload),
            })
          ),
          projectName: first.payload.projectName,
          url: `${notifications.appUrl}/projects/${first.payload.projectId}`,
        })
      );
      return "sent";
    } catch (error) {
      await db
        .update(notification)
        .set({ emailedAt: null })
        .where(inArray(notification.id, [...ids]));
      console.error("Editor comment digest failed", error);
      return "failed";
    }
  };

  return tally(
    await Promise.all(
      groupBy(due, (row) => `${row.userId}:${row.payload.projectId}`).map(send)
    )
  );
}

// The editor's replies and the status changes of top-level comments since
// the reviewer's last grouped email (or since they identified), as events.
async function reviewerEvents(db: Database) {
  const author = alias(reviewer, "author");
  const since = sql`coalesce(${reviewer.digestSentAt}, ${reviewer.createdAt})`;
  const isEditorReply = eq(comment.authorType, "editor");
  return await db
    .select({
      authorName: sql<string>`coalesce(${user.name}, ${author.name}, '')`,
      body: comment.body,
      deciderEmail: client.deciderEmail,
      deliverableTitle: deliverable.title,
      email: reviewer.email,
      // As text, to keep the database's microseconds in the cursor.
      eventAt: sql<string>`(case when ${isEditorReply} then ${comment.createdAt} else ${comment.statusChangedAt} end)::text`,
      locale: workspace.locale,
      name: reviewer.name,
      projectName: project.name,
      rejectReason: comment.rejectReason,
      reviewerEmails: client.reviewerEmails,
      reviewerId: reviewer.id,
      sentAt: sql<string | null>`${reviewer.digestSentAt}::text`,
      status: comment.status,
      studioName: workspace.name,
      timecodeMs: comment.timecodeMs,
      type: comment.authorType,
      versionNumber: version.number,
    })
    .from(reviewer)
    .innerJoin(project, eq(reviewer.projectId, project.id))
    .innerJoin(client, eq(project.clientId, client.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .innerJoin(deliverable, eq(deliverable.projectId, project.id))
    .innerJoin(version, eq(version.deliverableId, deliverable.id))
    .innerJoin(comment, eq(comment.versionId, version.id))
    .leftJoin(user, eq(comment.authorUserId, user.id))
    .leftJoin(author, eq(comment.reviewerId, author.id))
    .where(
      and(
        or(
          and(isEditorReply, gt(comment.createdAt, since)),
          and(isNull(comment.parentId), gt(comment.statusChangedAt, since))
        ),
        notInArray(project.status, FINISHED_PROJECT_STATUSES),
        activeReviewLink(db)
      )
    );
}

type ReviewerEvent = Awaited<ReturnType<typeof reviewerEvents>>[number];

const toDigestComment = (event: ReviewerEvent): DigestComment => ({
  authorName: event.authorName,
  body: notificationExcerpt(event.body),
  kind: event.type === "editor" ? "reply" : event.status,
  reason: event.type === "editor" ? null : event.rejectReason,
  where: where(event),
});

// Each reviewer's grouped email of what the editor did on their project.
// The reviewer's cursor moves to the last event emailed, claimed only if no
// other run moved it first.
async function sendReviewerDigests(db: Database, email: EmailConfig) {
  const events = await reviewerEvents(db);

  const send = async (rows: ReviewerEvent[]) => {
    const [first] = rows;
    if (
      !(
        first &&
        isAllowedReviewer(
          {
            deciderEmail: first.deciderEmail,
            reviewerEmails: first.reviewerEmails,
          },
          first.email
        )
      )
    ) {
      return "skipped";
    }
    const items = rows.toSorted((a, b) => a.eventAt.localeCompare(b.eventAt));
    const lastAt = items.at(-1)?.eventAt ?? first.eventAt;
    const [claimed] = await db
      .update(reviewer)
      .set({ digestSentAt: sql`${lastAt}::timestamp` })
      .where(
        and(
          eq(reviewer.id, first.reviewerId),
          sql`${reviewer.digestSentAt} is not distinct from ${first.sentAt}::timestamp`
        )
      )
      .returning({ id: reviewer.id });
    if (!claimed) {
      return "skipped";
    }
    try {
      await sendEmail(
        email,
        reviewerDigestEmail(resolveLocale(first.locale), first.email, {
          items: items.map(toDigestComment),
          projectName: first.projectName,
          reviewerName: first.name,
          studioName: first.studioName,
        })
      );
      return "sent";
    } catch (error) {
      await db
        .update(reviewer)
        .set({ digestSentAt: sql`${first.sentAt}::timestamp` })
        .where(eq(reviewer.id, first.reviewerId));
      console.error("Reviewer comment digest failed", error);
      return "failed";
    }
  };

  return tally(
    await Promise.all(groupBy(events, (event) => event.reviewerId).map(send))
  );
}

// "New comments" grouped emails (NOTIF-01), both ways, run by the scheduled
// job every 15 minutes.
export async function sendCommentDigests(
  db: Database,
  notifications: Notifications
) {
  const [editors, reviewers] = await Promise.all([
    sendEditorDigests(db, notifications),
    sendReviewerDigests(db, notifications.email),
  ]);
  return { editors, reviewers };
}
