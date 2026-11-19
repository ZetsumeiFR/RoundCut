import type { RevisionTerms } from "./revision-terms";

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

// Why the editor closed a round by hand (ROUND-03), shown to the client with
// the editor's note. "other" needs the note to explain itself.
export const MANUAL_CLOSE_REASONS = [
  "feedback_elsewhere",
  "approved_offline",
  "no_response",
  "other",
] as const;

export type ManualCloseReason = (typeof MANUAL_CLOSE_REASONS)[number];

export const ROUND_CLOSE_NOTE_MAX_LENGTH = 500;

// The editor's message to the client when gifting a round (ROUND-06).
export const ROUND_GIFT_NOTE_MAX_LENGTH = 500;

// A round the editor can offer for free (ROUND-06, "commercial gesture"):
// still open, beyond the included rounds and not already extra or gifted.
// Gifted rounds keep their trace and never create a billable line.
export function canGiftRound(
  round: { kind: RoundKind; position: number; status: RoundStatus },
  includedRounds: number
) {
  return (
    round.status === "open" &&
    round.kind === "included" &&
    round.position > includedRounds
  );
}

interface RoundTransition {
  closedReason?: RoundClosedReason;
  from: readonly RoundStatus[];
  to: Exclude<RoundStatus, "open">;
}

// Every move a round can make (ROUND-01); closed is final. Publishing the
// next version supersedes a round the client hasn't submitted yet, as the
// editor closing it would; approving the version ends its round whether or
// not feedback was submitted (EXTRA-06: approving instead of an extra round).
export const ROUND_TRANSITIONS = {
  approve: {
    closedReason: "approved",
    from: ["open", "submitted"],
    to: "closed",
  },
  closeManually: { closedReason: "manual", from: ["open"], to: "closed" },
  nextVersion: {
    closedReason: "next_version",
    from: ["open", "submitted"],
    to: "closed",
  },
  submit: { from: ["open"], to: "submitted" },
} as const satisfies Record<string, RoundTransition>;

export type RoundEvent = keyof typeof ROUND_TRANSITIONS;

interface CountedRound {
  id: string;
  number: number;
  openedAt: Date;
}

// Each round's place in the "round n of included" counter (ROUND-02): its
// number within its deliverable, or its opening order across all the
// project's deliverables when the revision terms count rounds per project.
export function roundPositions(
  rounds: readonly CountedRound[],
  scope: RevisionTerms["scope"]
): Map<string, number> {
  if (scope === "deliverable") {
    return new Map(rounds.map((item) => [item.id, item.number]));
  }
  const ordered = rounds.toSorted(
    (a, b) =>
      a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id)
  );
  return new Map(ordered.map((item, index) => [item.id, index + 1]));
}
