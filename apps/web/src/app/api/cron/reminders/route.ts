import { timingSafeEqual } from "node:crypto";

import { sendCommentDigests } from "@roundcut/api/notifications";
import {
  sendAwaitingFeedbackReminders,
  sendUnsubmittedFeedbackReminders,
} from "@roundcut/api/reminders";

import { ENV } from "@/env.server";
import { db, notifications } from "@/services";

const isCronRequest = (authorization: string | null, secret: string) => {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

// Scheduled reminders (ROUND-04, ROUND-05) and grouped comment emails
// (NOTIF-01), every 15 minutes, called by Vercel Cron or the
// docker-compose "cron" service with the CRON_SECRET bearer token.
export async function GET(request: Request) {
  if (!ENV.CRON_SECRET) {
    return new Response("Not found", { status: 404 });
  }
  if (!isCronRequest(request.headers.get("authorization"), ENV.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [awaitingFeedback, unsubmittedFeedback, commentDigests] =
    await Promise.all([
      sendAwaitingFeedbackReminders(db, ENV),
      sendUnsubmittedFeedbackReminders(db, ENV),
      sendCommentDigests(db, notifications),
    ]);
  return Response.json({
    awaitingFeedback,
    commentDigests,
    unsubmittedFeedback,
  });
}
