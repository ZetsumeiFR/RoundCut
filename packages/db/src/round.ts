// Revision round lifecycle (§7.2). Client-safe: no drizzle import.
// A round opens when a version is published (VER-04) or an extra round is
// granted (EXTRA); the client submits it, and it closes when the next version
// is published or the editor closes it (ROUND-03).
export const ROUND_KINDS = ["included", "extra", "gift"] as const;

export type RoundKind = (typeof ROUND_KINDS)[number];

export const ROUND_STATUSES = ["open", "submitted", "closed"] as const;

export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ROUND_CLOSED_REASONS = ["next_version"] as const;

export type RoundClosedReason = (typeof ROUND_CLOSED_REASONS)[number];
