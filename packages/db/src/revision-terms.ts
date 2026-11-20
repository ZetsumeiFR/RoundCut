export const REVISION_SCOPES = ["deliverable", "project"] as const;

// Prices are stored in cents, excluding VAT.
export interface RevisionTerms {
  extraRoundDelayDays: number;
  extraRoundPriceCents: number;
  includedRounds: number;
  // A lighter extra round the client can choose instead of the full one
  // (EXTRA-08), same delay; null offers the full round only. Terms saved
  // before EXTRA-08 lack the key: read them with lightExtraRoundPrice().
  lightExtraRoundPriceCents: number | null;
  requirePayment: boolean;
  scope: (typeof REVISION_SCOPES)[number];
}

export const DEFAULT_REVISION_TERMS: RevisionTerms = {
  extraRoundDelayDays: 2,
  extraRoundPriceCents: 12_000,
  includedRounds: 2,
  lightExtraRoundPriceCents: null,
  requirePayment: true,
  scope: "deliverable",
};

export const lightExtraRoundPrice = (terms: RevisionTerms) =>
  terms.lightExtraRoundPriceCents ?? null;
