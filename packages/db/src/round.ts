// Revision round lifecycle (§7.2). Client-safe: no drizzle import.
// A round opens when a version is published (VER-04) or an extra round is
// granted (EXTRA); the client submits it, and it closes when the next version
// is published, the editor closes it (ROUND-03) or the client approves the
// version (APPR-01).
export const ROUND_KINDS = ["included", "extra", "gift"] as const;

export type RoundKind = (typeof ROUND_KINDS)[number];

export const ROUND_STATUSES = ["open", "submitted", "closed"] as const;

export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ROUND_CLOSED_REASONS = [
  "next_version",
  "manual",
  "approved",
] as const;

export type RoundClosedReason = (typeof ROUND_CLOSED_REASONS)[number];

interface RoundTransition {
  closedReason?: RoundClosedReason;
  from: readonly RoundStatus[];
  to: Exclude<RoundStatus, "open">;
}

// Every move a round can make (ROUND-01); closed is final. Publishing the
// next version supersedes a round the client hasn't submitted yet, as the
// editor closing it would.
export const ROUND_TRANSITIONS = {
  approve: { closedReason: "approved", from: ["submitted"], to: "closed" },
  closeManually: { closedReason: "manual", from: ["open"], to: "closed" },
  nextVersion: {
    closedReason: "next_version",
    from: ["open", "submitted"],
    to: "closed",
  },
  submit: { from: ["open"], to: "submitted" },
} as const satisfies Record<string, RoundTransition>;

export type RoundEvent = keyof typeof ROUND_TRANSITIONS;
