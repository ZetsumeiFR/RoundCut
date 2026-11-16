import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import {
  REVIEWER_CODE_LENGTH,
  REVIEWER_CODE_MAX_ATTEMPTS,
  REVIEWER_CODE_RESEND_SECONDS,
  REVIEWER_CODE_VALIDITY_MINUTES,
  type ReviewerCodePurpose,
} from "@roundcut/db/reviewer-code";
import { reviewerCode } from "@roundcut/db/schema/reviewer-code";
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import z from "zod";

export const reviewerCodeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${REVIEWER_CODE_LENGTH}}$`));

const hashCode = (
  reviewerId: string,
  purpose: ReviewerCodePurpose,
  code: string
) =>
  createHash("sha256").update(`${reviewerId}:${purpose}:${code}`).digest("hex");

// A new code replaces the reviewer's previous one for the same purpose, unless
// that one was sent less than REVIEWER_CODE_RESEND_SECONDS ago: the upsert
// only overwrites an old enough row, so concurrent requests send one code.
export async function issueReviewerCode(
  db: Database,
  reviewerId: string,
  purpose: ReviewerCodePurpose
) {
  const now = new Date();
  const code = randomInt(0, 10 ** REVIEWER_CODE_LENGTH)
    .toString()
    .padStart(REVIEWER_CODE_LENGTH, "0");
  const values = {
    attempts: 0,
    codeHash: hashCode(reviewerId, purpose, code),
    createdAt: now,
    expiresAt: new Date(
      now.getTime() + REVIEWER_CODE_VALIDITY_MINUTES * 60 * 1000
    ),
  };
  const [saved] = await db
    .insert(reviewerCode)
    .values({ ...values, purpose, reviewerId })
    .onConflictDoUpdate({
      set: values,
      setWhere: lte(
        reviewerCode.createdAt,
        new Date(now.getTime() - REVIEWER_CODE_RESEND_SECONDS * 1000)
      ),
      target: [reviewerCode.reviewerId, reviewerCode.purpose],
    })
    .returning({ id: reviewerCode.id });
  if (!saved) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Wait a minute before asking for a new code",
    });
  }
  return code;
}

// Checks a typed code. Every check counts as an attempt before the comparison,
// so guesses stop at REVIEWER_CODE_MAX_ATTEMPTS even when sent in parallel; a
// right code is deleted, and only the request that deletes it succeeds.
export async function consumeReviewerCode(
  db: Database,
  reviewerId: string,
  purpose: ReviewerCodePurpose,
  code: string
) {
  const expired = new ORPCError("CODE_EXPIRED", {
    message: "This code expired: ask for a new one",
    status: 400,
  });
  const [current] = await db
    .update(reviewerCode)
    .set({ attempts: sql`${reviewerCode.attempts} + 1` })
    .where(
      and(
        eq(reviewerCode.reviewerId, reviewerId),
        eq(reviewerCode.purpose, purpose),
        gt(reviewerCode.expiresAt, new Date()),
        lt(reviewerCode.attempts, REVIEWER_CODE_MAX_ATTEMPTS)
      )
    )
    .returning({
      attempts: reviewerCode.attempts,
      codeHash: reviewerCode.codeHash,
      id: reviewerCode.id,
    });
  if (!current) {
    throw expired;
  }
  const matches = timingSafeEqual(
    Buffer.from(current.codeHash),
    Buffer.from(hashCode(reviewerId, purpose, code))
  );
  if (!matches) {
    const attemptsLeft = REVIEWER_CODE_MAX_ATTEMPTS - current.attempts;
    if (attemptsLeft === 0) {
      throw expired;
    }
    throw new ORPCError("INVALID_CODE", {
      data: { attemptsLeft },
      message: "Wrong code",
      status: 400,
    });
  }
  const [used] = await db
    .delete(reviewerCode)
    .where(
      and(
        eq(reviewerCode.id, current.id),
        eq(reviewerCode.codeHash, current.codeHash)
      )
    )
    .returning({ id: reviewerCode.id });
  if (!used) {
    throw expired;
  }
}
