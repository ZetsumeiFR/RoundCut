// Email codes proving a reviewer's address before an agreement (EXTRA-02).
// Client-safe: no drizzle import.
export const REVIEWER_CODE_PURPOSES = ["extra_round"] as const;

export type ReviewerCodePurpose = (typeof REVIEWER_CODE_PURPOSES)[number];

export const REVIEWER_CODE_LENGTH = 6;
export const REVIEWER_CODE_VALIDITY_MINUTES = 10;
export const REVIEWER_CODE_MAX_ATTEMPTS = 5;
// A new code can't be asked for before this delay, so the link can't be used
// to flood the decider's inbox.
export const REVIEWER_CODE_RESEND_SECONDS = 60;
