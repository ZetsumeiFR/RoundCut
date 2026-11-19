// Agreement records (EXTRA-03, §8 consent_record). Client-safe: no drizzle
// import. "approval" is the decider validating a version (EXTRA-06, APPR-01).
export const CONSENT_KINDS = ["extra_round", "approval"] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

// Bounds on the text the client saw when agreeing, sent with the agreement.
export const CONSENT_SHOWN_MAX_LINES = 20;
export const CONSENT_SHOWN_LINE_MAX_LENGTH = 1000;
