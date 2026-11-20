// Editor notifications (NOTIF-01, §8 notification). Client-safe: no drizzle
// import. Each row is an event on one of the editor's projects; "comment"
// rows also feed the grouped email sent every 15 minutes, the other events
// are emailed as they happen.
export const NOTIFICATION_TYPES = [
  "batch_submitted",
  "comment",
  "extra_round_accepted",
  "extra_round_proposed",
  "payment_received",
  "version_approved",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// What the event is about, copied when it happens so the row reads alone.
export interface NotificationPayload {
  // Who acted: the reviewer, or the decider for agreements and approvals.
  actorName: string;
  // A comment's text, cut to NOTIFICATION_EXCERPT_LENGTH.
  body?: string;
  deliverableTitle: string;
  projectId: string;
  projectName: string;
  // A reply to a thread rather than a new comment.
  reply?: boolean;
  roundNumber?: number;
  timecodeMs?: number;
  versionId: string;
  versionNumber: number;
}

export const NOTIFICATION_EXCERPT_LENGTH = 200;

export const notificationExcerpt = (text: string) =>
  text.length > NOTIFICATION_EXCERPT_LENGTH
    ? `${text.slice(0, NOTIFICATION_EXCERPT_LENGTH - 1)}…`
    : text;
