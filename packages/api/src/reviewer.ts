import { createHmac, timingSafeEqual } from "node:crypto";

import z from "zod";

export const REVIEWER_NAME_MAX_LENGTH = 120;
export const REVIEWER_IDENTITY_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Only the RPC endpoint reads the identity: the review page itself is static.
const COOKIE_PATH = "/api/rpc";
const COOKIE_PREFIX = "roundcut_reviewer_";

export const reviewerIdentitySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(REVIEWER_NAME_MAX_LENGTH),
});

export type ReviewerIdentity = z.infer<typeof reviewerIdentitySchema>;

// The decider can always review; the other reviewer emails of the client act
// as a whitelist only once at least one is set (REV-02).
export const isAllowedReviewer = (
  client: { deciderEmail: string; reviewerEmails: string[] },
  email: string
) =>
  email === client.deciderEmail.toLowerCase() ||
  client.reviewerEmails.length === 0 ||
  client.reviewerEmails.includes(email);

export interface ReviewerCookieOptions {
  secret: string;
  secure: boolean;
}

// The identity cookie of one project's review: "<reviewerId>.<expiry>.<mac>",
// an HMAC-SHA256 over the project, reviewer and expiry, so a cookie can't be
// forged, extended or replayed on another project's link.
export function createReviewerCookies(
  { secret, secure }: ReviewerCookieOptions,
  reqHeaders: Headers,
  resHeaders: Headers
) {
  const sign = (projectId: string, reviewerId: string, expiresAt: number) =>
    createHmac("sha256", secret)
      .update(`reviewer:${projectId}:${reviewerId}:${expiresAt}`)
      .digest("base64url");

  const write = (projectId: string, value: string, maxAge: number) => {
    const attributes = [
      `${COOKIE_PREFIX}${projectId}=${value}`,
      `Path=${COOKIE_PATH}`,
      `Max-Age=${maxAge}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (secure) {
      attributes.push("Secure");
    }
    resHeaders.append("Set-Cookie", attributes.join("; "));
  };

  return {
    clear: (projectId: string) => write(projectId, "", 0),

    read: (projectId: string, now = Date.now()) => {
      const name = `${COOKIE_PREFIX}${projectId}=`;
      const value = reqHeaders
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(name))
        ?.slice(name.length);
      const [reviewerId, expiry, mac, ...rest] = value?.split(".") ?? [];
      const expiresAt = Number(expiry);
      if (!(reviewerId && mac) || rest.length > 0 || !(expiresAt > now)) {
        return null;
      }
      const expected = Buffer.from(sign(projectId, reviewerId, expiresAt));
      const actual = Buffer.from(mac);
      return expected.length === actual.length &&
        timingSafeEqual(expected, actual)
        ? reviewerId
        : null;
    },

    set: (projectId: string, reviewerId: string, now = Date.now()) => {
      const expiresAt = now + REVIEWER_IDENTITY_MAX_AGE_SECONDS * 1000;
      write(
        projectId,
        `${reviewerId}.${expiresAt}.${sign(projectId, reviewerId, expiresAt)}`,
        REVIEWER_IDENTITY_MAX_AGE_SECONDS
      );
    },
  };
}

export type ReviewerCookies = ReturnType<typeof createReviewerCookies>;
