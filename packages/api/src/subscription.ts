import type { Database } from "@roundcut/db";
import {
  BILLING_INTERVALS,
  type BillingInterval,
  CANCELLATION_REASONS,
  DEFAULT_PLAN,
  FOUNDER_OFFER,
  isLiveSubscription,
  PLAN_CURRENCY,
  PLANS,
  type Plan,
  planPriceCents,
} from "@roundcut/db/plan";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, eq, isNull, or } from "drizzle-orm";
import Stripe from "stripe";

import type { StripeClient } from "./payments";

// RoundCut's own subscriptions (SUB-01), billed on the platform Stripe
// account: one Product per plan with a monthly and a yearly Price found by
// lookup key, created on first use so a fresh Stripe account needs no setup.
const PRODUCT_NAMES: Record<Plan, string> = {
  pro: "RoundCut Pro",
  solo: "RoundCut Solo",
  studio: "RoundCut Studio",
};

export const FOUNDER_COUPON_ID = "roundcut_founder";

const productIdOf = (plan: Plan) => `roundcut_${plan}`;

const lookupKeyOf = (plan: Plan, interval: BillingInterval) =>
  `roundcut_${plan}_${interval}`;

function planOfLookupKey(key: string | null) {
  for (const plan of PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (key === lookupKeyOf(plan, interval)) {
        return { interval, plan };
      }
    }
  }
  return null;
}

const isStripeError = (error: unknown, code: string) =>
  error instanceof Stripe.errors.StripeError && error.code === code;

async function ensureProduct(stripe: StripeClient, plan: Plan) {
  try {
    await stripe.products.create({
      id: productIdOf(plan),
      metadata: { plan },
      name: PRODUCT_NAMES[plan],
    });
  } catch (error) {
    if (!isStripeError(error, "resource_already_exists")) {
      throw error;
    }
  }
}

export async function planPriceId(
  stripe: StripeClient,
  plan: Plan,
  interval: BillingInterval
) {
  const lookupKey = lookupKeyOf(plan, interval);
  const { data } = await stripe.prices.list({
    active: true,
    limit: 1,
    lookup_keys: [lookupKey],
  });
  const [existing] = data;
  if (existing) {
    return existing.id;
  }
  await ensureProduct(stripe, plan);
  const unitAmount = planPriceCents(plan, interval);
  const price = await stripe.prices.create(
    {
      currency: PLAN_CURRENCY.toLowerCase(),
      lookup_key: lookupKey,
      metadata: { interval, plan },
      product: productIdOf(plan),
      recurring: { interval },
      unit_amount: unitAmount,
    },
    { idempotencyKey: `roundcut-price-${lookupKey}-${unitAmount}` }
  );
  return price.id;
}

// The Founder coupon brings Pro yearly down to the offer's price, forever,
// for at most FOUNDER_OFFER.seats subscriptions: Stripe enforces the cap.
async function founderCoupon(stripe: StripeClient) {
  try {
    return await stripe.coupons.retrieve(FOUNDER_COUPON_ID);
  } catch (error) {
    if (!isStripeError(error, "resource_missing")) {
      throw error;
    }
  }
  await ensureProduct(stripe, FOUNDER_OFFER.plan);
  try {
    return await stripe.coupons.create({
      amount_off:
        planPriceCents(FOUNDER_OFFER.plan, FOUNDER_OFFER.interval) -
        FOUNDER_OFFER.priceCents,
      applies_to: { products: [productIdOf(FOUNDER_OFFER.plan)] },
      currency: PLAN_CURRENCY.toLowerCase(),
      duration: "forever",
      id: FOUNDER_COUPON_ID,
      max_redemptions: FOUNDER_OFFER.seats,
      name: "RoundCut Founder",
    });
  } catch (error) {
    if (isStripeError(error, "resource_already_exists")) {
      return await stripe.coupons.retrieve(FOUNDER_COUPON_ID);
    }
    throw error;
  }
}

export async function founderSeatsLeft(stripe: StripeClient) {
  const coupon = await founderCoupon(stripe);
  if (!coupon.valid) {
    return 0;
  }
  const cap = coupon.max_redemptions ?? FOUNDER_OFFER.seats;
  return Math.max(0, cap - coupon.times_redeemed);
}

export const isFounderChoice = (plan: Plan, interval: BillingInterval) =>
  plan === FOUNDER_OFFER.plan && interval === FOUNDER_OFFER.interval;

// The workspace's plan as its subscription has it now. A live subscription
// sets the plan of its price; any other status (canceled, unpaid,
// incomplete...) puts the workspace back on Solo. A subscription that isn't
// the workspace's current one only takes over while it is live, so a late
// event of an old canceled subscription can't downgrade a newer one.
// planCancelAt is the end of a scheduled cancellation (SUB-03).
export async function syncSubscription(
  db: Database,
  subscription: Stripe.Subscription
) {
  const { workspaceId } = subscription.metadata;
  const [item] = subscription.items.data;
  const choice = planOfLookupKey(item?.price.lookup_key ?? null);
  if (!(workspaceId && item && choice)) {
    return;
  }
  const live = isLiveSubscription(subscription.status);
  const values = live
    ? {
        plan: choice.plan,
        planCancelAt: subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000)
          : null,
        planFounder: subscription.metadata.founder === "true",
        planInterval: choice.interval,
        planRenewsAt: new Date(item.current_period_end * 1000),
        planStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
      }
    : {
        plan: DEFAULT_PLAN,
        planCancelAt: null,
        planFounder: false,
        planInterval: null,
        planRenewsAt: null,
        planStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
      };
  const current = or(
    isNull(workspace.stripeSubscriptionId),
    eq(workspace.stripeSubscriptionId, subscription.id)
  );
  await db
    .update(workspace)
    .set(values)
    .where(and(eq(workspace.id, workspaceId), live ? undefined : current));
}

// Events can arrive late or out of order: the subscription is read back
// from Stripe so the workspace always gets its latest state.
async function syncSubscriptionById(
  db: Database,
  stripe: StripeClient,
  subscriptionId: string
) {
  await syncSubscription(
    db,
    await stripe.subscriptions.retrieve(subscriptionId)
  );
}

// After Checkout returns, without waiting for the webhook: the customer's
// most recent subscription.
export async function syncLatestSubscription(
  db: Database,
  stripe: StripeClient,
  customerId: string
) {
  const { data } = await stripe.subscriptions.list({
    customer: customerId,
    limit: 1,
    status: "all",
  });
  const [latest] = data;
  if (latest) {
    await syncSubscription(db, latest);
  }
}

// The Customer Portal (SUB-03) where the owner updates the card, reads the
// invoices and cancels at the end of the period, created on first use and
// found again by its metadata, like the plans' products.
const PORTAL_CONFIGURATION_KEY = "roundcut_subscription";

async function portalConfigurationId(stripe: StripeClient) {
  const { data } = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  const existing = data.find(
    (candidate) => candidate.metadata?.roundcut === PORTAL_CONFIGURATION_KEY
  );
  if (existing) {
    return existing.id;
  }
  const created = await stripe.billingPortal.configurations.create(
    {
      features: {
        customer_update: {
          allowed_updates: ["address", "email", "name", "tax_id"],
          enabled: true,
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          cancellation_reason: {
            enabled: true,
            options: [...CANCELLATION_REASONS],
          },
          enabled: true,
          mode: "at_period_end",
        },
      },
      metadata: { roundcut: PORTAL_CONFIGURATION_KEY },
      name: "RoundCut subscriptions",
    },
    { idempotencyKey: `roundcut-portal-${PORTAL_CONFIGURATION_KEY}` }
  );
  return created.id;
}

export const PORTAL_FLOWS = ["payment_method_update"] as const;

export async function portalSessionUrl(
  stripe: StripeClient,
  input: {
    customer: string;
    flow: (typeof PORTAL_FLOWS)[number] | null;
    locale: string;
    returnUrl: string;
  }
) {
  const session = await stripe.billingPortal.sessions.create({
    configuration: await portalConfigurationId(stripe),
    customer: input.customer,
    flow_data: input.flow ? { type: input.flow } : undefined,
    locale: input.locale === "fr" ? "fr" : "en",
    return_url: input.returnUrl,
  });
  return session.url;
}

// Events of RoundCut's own Stripe account (not of a connected account).
export async function handleSubscriptionEvent(
  db: Database,
  stripe: StripeClient,
  event: Stripe.Event
) {
  switch (event.type) {
    case "checkout.session.completed": {
      const { mode, subscription } = event.data.object;
      if (mode === "subscription" && subscription) {
        await syncSubscriptionById(
          db,
          stripe,
          typeof subscription === "string" ? subscription : subscription.id
        );
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.deleted":
    case "customer.subscription.updated":
      await syncSubscriptionById(db, stripe, event.data.object.id);
      return;
    default:
      return;
  }
}
