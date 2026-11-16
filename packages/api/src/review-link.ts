import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import z from "zod";

// 32 random bytes (256 bits, at least the 128 required by REV-01), written in
// base64url: 43 characters that fit a URL path segment as is.
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[\w-]{43}$/;

export const reviewTokenSchema = z.string().regex(TOKEN_PATTERN);

export const createReviewToken = () =>
  randomBytes(TOKEN_BYTES).toString("base64url");

export const hashReviewToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const sameTokenHash = (a: string, b: string) => {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};

export const isReviewLinkExpired = (
  link: { expiresAt: Date | null },
  now = new Date()
) => link.expiresAt !== null && link.expiresAt <= now;

const futureDate = z
  .date()
  .refine((date) => date > new Date(), "Expiry must be in the future");

export const reviewLinkSchema = z.object({
  expiresAt: futureDate.nullable(),
  projectId: z.string().min(1),
});
