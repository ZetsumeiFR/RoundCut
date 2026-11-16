import {
  canGiftRound,
  type RoundClosedReason,
  type RoundKind,
  type RoundStatus,
} from "./round";

// Extra round offers (EXTRA, §7.3). Client-safe: no drizzle import.
// An offer is proposed once the included rounds are used up and the client
// starts a new batch (EXTRA-01); the decider accepts or declines it, or it
// expires after EXTRA_ROUND_OFFER_VALIDITY_DAYS without an answer.
export const EXTRA_ROUND_OFFER_STATUSES = [
  "proposed",
  "accepted",
  "declined",
  "expired",
] as const;

export type ExtraRoundOfferStatus = (typeof EXTRA_ROUND_OFFER_STATUSES)[number];

export const EXTRA_ROUND_OFFER_VALIDITY_DAYS = 14;

const BASIS_POINTS = 10_000;

// Amounts shown to the client (§7.4): the price excludes VAT, the VAT is
// rounded to the cent, and the total is their sum.
export function offerAmounts(priceCents: number, vatRateBps: number) {
  const vatCents = Math.round((priceCents * vatRateBps) / BASIS_POINTS);
  return { grossCents: priceCents + vatCents, netCents: priceCents, vatCents };
}

// Whether the client's next batch on a version falls beyond the included
// rounds (§7.1): the round open on it is beyond them and was neither offered
// (ROUND-06) nor granted as an extra round, or its round was the last
// included one (or later) and is already submitted or closed, so feedback
// written now waits for a round that will be beyond them. An approved
// version takes no more feedback.
export function needsExtraRound(
  round: {
    closedReason: RoundClosedReason | null;
    kind: RoundKind;
    position: number;
    status: RoundStatus;
  },
  includedRounds: number
) {
  if (round.status === "open") {
    return canGiftRound(round, includedRounds);
  }
  return round.closedReason !== "approved" && round.position >= includedRounds;
}
