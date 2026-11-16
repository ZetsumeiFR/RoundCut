export const REVISION_SCOPES = ["deliverable", "project"] as const;

// Prices are stored in cents, excluding VAT.
export interface RevisionTerms {
  extraRoundDelayDays: number;
  extraRoundPriceCents: number;
  includedRounds: number;
  requirePayment: boolean;
  scope: (typeof REVISION_SCOPES)[number];
}

export const DEFAULT_REVISION_TERMS: RevisionTerms = {
  extraRoundDelayDays: 2,
  extraRoundPriceCents: 12_000,
  includedRounds: 2,
  requirePayment: true,
  scope: "deliverable",
};
