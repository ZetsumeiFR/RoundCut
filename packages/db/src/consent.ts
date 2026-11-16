// Agreement records (EXTRA-03, §8 consent_record). Client-safe: no drizzle
// import. APPR-01 adds the "approval" kind for the final approval.
export const CONSENT_KINDS = ["extra_round"] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

// Bounds on the text the client saw when agreeing, sent with the agreement.
export const CONSENT_SHOWN_MAX_LINES = 20;
export const CONSENT_SHOWN_LINE_MAX_LENGTH = 1000;
