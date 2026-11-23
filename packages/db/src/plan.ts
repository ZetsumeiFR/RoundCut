// RoundCut subscription plans (SUB-01). Client-safe: no drizzle import.
// A workspace without a subscription is on Solo; the limits below apply to
// it (VER-02: maximum size of one uploaded file).
export const PLANS = ["solo", "pro", "studio"] as const;

export type Plan = (typeof PLANS)[number];

export const DEFAULT_PLAN: Plan = "solo";

// Stripe's recurring intervals: monthly, or yearly at ANNUAL_PAID_MONTHS.
export const BILLING_INTERVALS = ["month", "year"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

// Yearly billing charges ten months for twelve.
export const ANNUAL_PAID_MONTHS = 10;

export const PLAN_CURRENCY = "EUR";

const PLAN_MONTHLY_CENTS: Record<Plan, number> = {
  pro: 3900,
  solo: 1900,
  studio: 7900,
};

export const planPriceCents = (plan: Plan, interval: BillingInterval) =>
  interval === "year"
    ? PLAN_MONTHLY_CENTS[plan] * ANNUAL_PAID_MONTHS
    : PLAN_MONTHLY_CENTS[plan];

const GIGABYTE = 1024 ** 3;

export interface PlanLimits {
  // Projects not finished at the same time; null = unlimited.
  activeProjects: number | null;
  maxFileBytes: number;
  seats: number;
  storageBytes: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  pro: {
    activeProjects: null,
    maxFileBytes: 5 * GIGABYTE,
    seats: 1,
    storageBytes: 200 * GIGABYTE,
  },
  solo: {
    activeProjects: 5,
    maxFileBytes: 2 * GIGABYTE,
    seats: 1,
    storageBytes: 50 * GIGABYTE,
  },
  studio: {
    activeProjects: null,
    maxFileBytes: 5 * GIGABYTE,
    seats: 3,
    storageBytes: 500 * GIGABYTE,
  },
};

// White-labelled review links (REV-10): the editor's logo and accent color.
export const hasWhiteLabel = (plan: Plan) => plan !== "solo";

// Online payment of extra rounds on the editor's Stripe account (EXTRA-04).
export const hasRoundPayments = (plan: Plan) => plan !== "solo";

// Founder offer: Pro billed yearly at 99 € a year, for the first 30
// subscribers (a Stripe coupon capped at that many redemptions).
export const FOUNDER_OFFER = {
  interval: "year",
  plan: "pro",
  priceCents: 9900,
  seats: 30,
} as const satisfies {
  interval: BillingInterval;
  plan: Plan;
  priceCents: number;
  seats: number;
};

// Stripe subscription statuses that keep the paid plan's features.
export const LIVE_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "trialing",
] as const;

export const isLiveSubscription = (status: string | null) =>
  LIVE_SUBSCRIPTION_STATUSES.some((live) => live === status);

// Free trial (SUB-02): every new workspace gets the Pro plan for 14 days,
// without a card. Once it ends without a subscription, the workspace is back
// on its stored plan (Solo).
export const TRIAL_DAYS = 14;

export const TRIAL_PLAN: Plan = "pro";

export interface PlanState {
  plan: Plan;
  planStatus: string | null;
  trialEndsAt: Date;
}

export const isTrialing = (state: PlanState, now = new Date()) =>
  !isLiveSubscription(state.planStatus) && state.trialEndsAt > now;

// The plan whose limits and features apply right now.
export const workspacePlan = (state: PlanState, now = new Date()): Plan =>
  isTrialing(state, now) ? TRIAL_PLAN : state.plan;
