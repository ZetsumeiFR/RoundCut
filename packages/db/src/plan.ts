// RoundCut subscription plans (SUB-01). Client-safe: no drizzle import.
// Until billing ships every workspace is on Solo; the per-plan limits below
// already apply (VER-02: maximum size of one uploaded file).
export const PLANS = ["solo", "pro", "studio"] as const;

export type Plan = (typeof PLANS)[number];

export const DEFAULT_PLAN: Plan = "solo";

const GIGABYTE = 1024 ** 3;

export const PLAN_MAX_FILE_BYTES: Record<Plan, number> = {
  pro: 5 * GIGABYTE,
  solo: 2 * GIGABYTE,
  studio: 5 * GIGABYTE,
};

// White-labelled review links (REV-10): the editor's logo and accent color.
export const hasWhiteLabel = (plan: Plan) => plan !== "solo";

// Online payment of extra rounds on the editor's Stripe account (EXTRA-04).
export const hasRoundPayments = (plan: Plan) => plan !== "solo";
