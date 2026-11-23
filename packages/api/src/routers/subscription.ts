import { ORPCError } from "@orpc/server";
import {
  BILLING_INTERVALS,
  CANCELLATION_COMMENT_MAX_LENGTH,
  CANCELLATION_REASONS,
  FOUNDER_OFFER,
  isLiveSubscription,
  isTrialing,
  PLAN_CURRENCY,
  PLAN_LIMITS,
  PLANS,
  planPriceCents,
  TRIAL_PLAN,
  workspacePlan,
} from "@roundcut/db/plan";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, count, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import type { StripeClient } from "../payments";
import { FINISHED_PROJECT_STATUSES } from "../reminders";
import {
  FOUNDER_COUPON_ID,
  founderSeatsLeft,
  isFounderChoice,
  PORTAL_FLOWS,
  planPriceId,
  portalSessionUrl,
  syncLatestSubscription,
  syncSubscription,
} from "../subscription";
import { getOrCreateWorkspace } from "./workspace";

type WorkspaceRow = Awaited<ReturnType<typeof getOrCreateWorkspace>>;
type WorkspaceDb = Parameters<typeof getOrCreateWorkspace>[0];

// Tags RoundCut's subscription sessions in the Stripe Dashboard.
const CHECKOUT_INTEGRATION_ID = "roundcut_subscription_qzmvtrex";

const checkoutSchema = z.object({
  founder: z.boolean().default(false),
  interval: z.enum(BILLING_INTERVALS),
  plan: z.enum(PLANS),
});

const portalSchema = z.object({
  flow: z.enum(PORTAL_FLOWS).nullable().default(null),
});

const cancelSchema = z.object({
  comment: z.string().trim().max(CANCELLATION_COMMENT_MAX_LENGTH).default(""),
  reason: z.enum(CANCELLATION_REASONS),
});

// Invoices listed on the subscription page; older ones are in the portal.
const INVOICE_LIMIT = 12;

export interface InvoiceSummary {
  amountCents: number;
  createdAt: Date;
  currency: string;
  hostedUrl: string | null;
  id: string;
  number: string | null;
  pdfUrl: string | null;
  status: string | null;
}

const requireStripe = (stripe: StripeClient | null) => {
  if (!stripe) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "Subscriptions aren't configured",
    });
  }
  return stripe;
};

// The workspace's Stripe customer, created once; a concurrent request may
// have stored its customer first, then that one is kept.
async function customerId(
  context: { db: WorkspaceDb; stripe: StripeClient },
  row: WorkspaceRow,
  email: string
) {
  if (row.stripeCustomerId) {
    return row.stripeCustomerId;
  }
  const customer = await context.stripe.customers.create(
    {
      email,
      metadata: { workspaceId: row.id },
      name: row.name,
      preferred_locales: [row.locale],
    },
    { idempotencyKey: `roundcut-customer-${row.id}` }
  );
  await context.db
    .update(workspace)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(workspace.id, row.id), isNull(workspace.stripeCustomerId)));
  const [saved] = await context.db
    .select({ stripeCustomerId: workspace.stripeCustomerId })
    .from(workspace)
    .where(eq(workspace.id, row.id));
  return saved?.stripeCustomerId ?? customer.id;
}

// What the workspace uses against its plan's limits (SUB-02): projects not
// finished yet, and the bytes of its published versions.
async function workspaceUsage(db: WorkspaceDb, workspaceId: string) {
  const [[projects], [storage]] = await Promise.all([
    db
      .select({ active: count() })
      .from(project)
      .where(
        and(
          eq(project.workspaceId, workspaceId),
          notInArray(project.status, FINISHED_PROJECT_STATUSES)
        )
      ),
    db
      .select({
        bytes: sql`coalesce(sum(${version.sizeBytes}), 0)`.mapWith(Number),
      })
      .from(version)
      .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
      .innerJoin(project, eq(deliverable.projectId, project.id))
      .where(
        and(
          eq(project.workspaceId, workspaceId),
          ne(version.status, "uploading")
        )
      ),
  ]);
  return {
    activeProjects: projects?.active ?? 0,
    storageBytes: storage?.bytes ?? 0,
  };
}

// The workspace's live subscription, which cancel and resume act on.
function liveSubscriptionId(row: WorkspaceRow) {
  if (!(isLiveSubscription(row.planStatus) && row.stripeSubscriptionId)) {
    throw new ORPCError("CONFLICT", {
      message: "This workspace has no subscription",
    });
  }
  return row.stripeSubscriptionId;
}

const catalog = PLANS.map((plan) => ({
  limits: PLAN_LIMITS[plan],
  plan,
  prices: {
    month: planPriceCents(plan, "month"),
    year: planPriceCents(plan, "year"),
  },
}));

export const subscriptionRouter = {
  // Cancels at the end of the paid period (SUB-03), with the owner's reason
  // kept on the Stripe subscription. The workspace is updated right away
  // from Stripe's answer; the webhook brings the same state.
  cancel: protectedProcedure
    .input(cancelSchema)
    .handler(async ({ context, input }) => {
      const stripe = requireStripe(context.stripe);
      const row = await getOrCreateWorkspace(context.db, context.session.user);
      const subscription = await stripe.subscriptions.update(
        liveSubscriptionId(row),
        {
          cancel_at_period_end: true,
          cancellation_details: {
            comment: input.comment || undefined,
            feedback: input.reason,
          },
        }
      );
      await syncSubscription(context.db, subscription);
      return {
        cancelAt: subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000)
          : null,
      };
    }),

  // Where the owner's browser subscribes: a Stripe Checkout session for the
  // chosen plan and interval, with the Founder coupon when asked for.
  // A live subscription refuses a second Checkout: it is canceled or resumed
  // from the subscription page, its card and invoices are in the Customer
  // Portal (SUB-03).
  checkoutUrl: protectedProcedure
    .input(checkoutSchema)
    .handler(async ({ context, input }) => {
      const stripe = requireStripe(context.stripe);
      if (input.founder && !isFounderChoice(input.plan, input.interval)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The Founder offer is Pro billed yearly",
        });
      }
      const row = await getOrCreateWorkspace(context.db, context.session.user);
      if (isLiveSubscription(row.planStatus)) {
        throw new ORPCError("CONFLICT", {
          message: "This workspace already has a subscription",
        });
      }
      if (input.founder && (await founderSeatsLeft(stripe)) === 0) {
        throw new ORPCError("CONFLICT", {
          data: { reason: "FOUNDER_SOLD_OUT" },
          message: "The Founder offer is sold out",
        });
      }
      const [price, customer] = await Promise.all([
        planPriceId(stripe, input.plan, input.interval),
        customerId({ db: context.db, stripe }, row, context.session.user.email),
      ]);
      const returnUrl = `${context.notifications.appUrl}/account/subscription`;
      const session = await stripe.checkout.sessions.create({
        // The plans are priced in euros: no conversion to the payer's currency.
        adaptive_pricing: { enabled: false },
        cancel_url: `${returnUrl}?checkout=cancel`,
        client_reference_id: row.id,
        customer,
        discounts: input.founder ? [{ coupon: FOUNDER_COUPON_ID }] : undefined,
        integration_identifier: CHECKOUT_INTEGRATION_ID,
        line_items: [{ price, quantity: 1 }],
        locale: row.locale === "fr" ? "fr" : "en",
        metadata: { workspaceId: row.id },
        mode: "subscription",
        subscription_data: {
          metadata: { founder: String(input.founder), workspaceId: row.id },
        },
        success_url: `${returnUrl}?checkout=success`,
      });
      if (!session.url) {
        throw new Error(`Checkout session ${session.id} has no URL`);
      }
      return { url: session.url };
    }),

  // The workspace's last invoices from Stripe, newest first.
  invoices: protectedProcedure.handler(async ({ context }) => {
    const stripe = requireStripe(context.stripe);
    const row = await getOrCreateWorkspace(context.db, context.session.user);
    if (!row.stripeCustomerId) {
      return [];
    }
    const { data } = await stripe.invoices.list({
      customer: row.stripeCustomerId,
      limit: INVOICE_LIMIT,
    });
    return data
      .filter((invoice) => invoice.status !== "draft")
      .map(
        (invoice): InvoiceSummary => ({
          amountCents: invoice.total,
          createdAt: new Date(invoice.created * 1000),
          currency: invoice.currency.toUpperCase(),
          hostedUrl: invoice.hosted_invoice_url ?? null,
          id: invoice.id,
          number: invoice.number,
          pdfUrl: invoice.invoice_pdf ?? null,
          status: invoice.status,
        })
      );
  }),

  // The Stripe Customer Portal (SUB-03): card, invoices, billing details and
  // cancellation; `flow` opens straight on the card update.
  portalUrl: protectedProcedure
    .input(portalSchema)
    .handler(async ({ context, input }) => {
      const stripe = requireStripe(context.stripe);
      const row = await getOrCreateWorkspace(context.db, context.session.user);
      if (!row.stripeCustomerId) {
        throw new ORPCError("CONFLICT", {
          message: "This workspace has never subscribed",
        });
      }
      const url = await portalSessionUrl(stripe, {
        customer: row.stripeCustomerId,
        flow: input.flow,
        locale: row.locale,
        returnUrl: `${context.notifications.appUrl}/account/subscription`,
      });
      return { url };
    }),

  // Back from Checkout: the subscription as Stripe has it, in case the
  // webhook hasn't arrived yet.
  refresh: protectedProcedure.handler(async ({ context }) => {
    const stripe = requireStripe(context.stripe);
    const row = await getOrCreateWorkspace(context.db, context.session.user);
    if (row.stripeCustomerId) {
      await syncLatestSubscription(context.db, stripe, row.stripeCustomerId);
    }
    return { refreshed: row.stripeCustomerId !== null };
  }),

  // Takes back a scheduled cancellation: the subscription renews again.
  resume: protectedProcedure.handler(async ({ context }) => {
    const stripe = requireStripe(context.stripe);
    const row = await getOrCreateWorkspace(context.db, context.session.user);
    const subscription = await stripe.subscriptions.update(
      liveSubscriptionId(row),
      // An empty cancel_at clears both kinds of scheduled cancellation;
      // Stripe refuses it next to cancel_at_period_end.
      { cancel_at: "" }
    );
    await syncSubscription(context.db, subscription);
    return { resumed: subscription.cancel_at === null };
  }),

  // The workspace's plan, its trial and usage, the plan catalog and what's
  // left of the Founder offer (null when the instance has no Stripe).
  status: protectedProcedure.handler(async ({ context }) => {
    const row = await getOrCreateWorkspace(context.db, context.session.user);
    const { stripe } = context;
    const now = new Date();
    return {
      available: stripe !== null,
      catalog,
      currency: PLAN_CURRENCY,
      // The plan whose limits apply now: the trial's while it runs.
      effectivePlan: workspacePlan(row, now),
      founder: {
        ...FOUNDER_OFFER,
        seatsLeft: stripe ? await founderSeatsLeft(stripe) : null,
      },
      subscription: {
        // End of a scheduled cancellation, null while it renews.
        cancelAt: row.planCancelAt,
        founder: row.planFounder,
        interval: row.planInterval,
        live: isLiveSubscription(row.planStatus),
        plan: row.plan,
        renewsAt: row.planRenewsAt,
        status: row.planStatus,
      },
      trial: {
        active: isTrialing(row, now),
        endsAt: row.trialEndsAt,
        plan: TRIAL_PLAN,
      },
      usage: await workspaceUsage(context.db, row.id),
    };
  }),
};
