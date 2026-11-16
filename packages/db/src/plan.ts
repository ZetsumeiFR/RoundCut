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
