import { timingSafeEqual } from "node:crypto";

import {
  sendAwaitingFeedbackReminders,
  sendUnsubmittedFeedbackReminders,
} from "@roundcut/api/reminders";

import { ENV } from "@/env.server";
import { db } from "@/services";

const isCronRequest = (authorization: string | null, secret: string) => {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

// Scheduled reminders (ROUND-04, ROUND-05), called by Vercel Cron or the
// docker-compose "cron" service with the CRON_SECRET bearer token.
export async function GET(request: Request) {
  if (!ENV.CRON_SECRET) {
    return new Response("Not found", { status: 404 });
  }
  if (!isCronRequest(request.headers.get("authorization"), ENV.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [awaitingFeedback, unsubmittedFeedback] = await Promise.all([
    sendAwaitingFeedbackReminders(db, ENV),
    sendUnsubmittedFeedbackReminders(db, ENV),
  ]);
  return Response.json({ awaitingFeedback, unsubmittedFeedback });
}
