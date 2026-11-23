import { ORPCError } from "@orpc/server";
import { hasRoundPayments, workspacePlan } from "@roundcut/db/plan";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, eq, isNull } from "drizzle-orm";

import { protectedProcedure } from "../index";
import { fetchPaymentsActive, type StripeClient } from "../payments";
import { getOrCreateWorkspace } from "./workspace";

type WorkspaceRow = Awaited<ReturnType<typeof getOrCreateWorkspace>>;
type WorkspaceDb = Parameters<typeof getOrCreateWorkspace>[0];

// RoundCut serves editors established in France (SIREN, French VAT): their
// Stripe account is French. Stripe needs the country before the merchant
// configuration; the rest of the identity is collected by its onboarding.
const CONNECTED_ACCOUNT_COUNTRY = "fr";

const requireStripe = (stripe: StripeClient | null) => {
  if (!stripe) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "Online payments aren't configured",
    });
  }
  return stripe;
};

// Online payment of extra rounds is a Pro and Studio feature (EXTRA-04).
const requireRoundPayments = (row: WorkspaceRow) => {
  if (!hasRoundPayments(workspacePlan(row))) {
    throw new ORPCError("FORBIDDEN", {
      message: "Online payments require the Pro or Studio plan",
    });
  }
};

// The connected account's capability as Stripe has it now, kept on the
// workspace so offers know whether to ask for payment.
async function refreshPaymentsActive(
  context: { db: WorkspaceDb; stripe: StripeClient },
  row: WorkspaceRow & { stripeAccountId: string }
) {
  const active = await fetchPaymentsActive(context.stripe, row.stripeAccountId);
  if (active !== row.stripePaymentsActive) {
    await context.db
      .update(workspace)
      .set({ stripePaymentsActive: active })
      .where(eq(workspace.id, row.id));
  }
  return active;
}

// The editor's Stripe account, created once per workspace: the full Stripe
// Dashboard, Stripe collecting its fees and owning losses, and card payments
// requested for direct charges. FR platforms can't set the name or email
// through the API: Stripe's onboarding collects them.
async function connectedAccountId(
  context: { db: WorkspaceDb; stripe: StripeClient },
  row: WorkspaceRow
) {
  if (row.stripeAccountId) {
    return row.stripeAccountId;
  }
  const account = await context.stripe.v2.core.accounts.create(
    {
      configuration: {
        customer: {},
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      dashboard: "full",
      defaults: {
        currency: row.currency.toLowerCase(),
        locales: [row.locale === "fr" ? "fr-FR" : "en-US"],
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      identity: { country: CONNECTED_ACCOUNT_COUNTRY },
      metadata: { workspaceId: row.id },
    },
    { idempotencyKey: `roundcut-connect-${row.id}` }
  );
  // A concurrent request may have stored its account first: keep that one.
  await context.db
    .update(workspace)
    .set({ stripeAccountId: account.id })
    .where(and(eq(workspace.id, row.id), isNull(workspace.stripeAccountId)));
  const [saved] = await context.db
    .select({ stripeAccountId: workspace.stripeAccountId })
    .from(workspace)
    .where(eq(workspace.id, row.id));
  return saved?.stripeAccountId ?? account.id;
}

export const paymentsRouter = {
  // Where the editor's browser goes to create or finish their Stripe account
  // (Stripe-hosted onboarding); Stripe sends them back to the plan terms.
  connect: protectedProcedure.handler(async ({ context }) => {
    const stripe = requireStripe(context.stripe);
    const row = await getOrCreateWorkspace(context.db, context.session.user);
    requireRoundPayments(row);
    const accountId = await connectedAccountId({ db: context.db, stripe }, row);
    const termsUrl = `${context.notifications.appUrl}/account/terms`;
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        account_onboarding: {
          refresh_url: `${termsUrl}?stripe=refresh`,
          return_url: `${termsUrl}?stripe=return`,
        },
        type: "account_onboarding",
      },
    });
    return { url: link.url };
  }),

  // Whether the editor can take extra round payments online: the instance
  // has Stripe, the plan includes it, and the connected account's status.
  status: protectedProcedure.handler(async ({ context }) => {
    const row = await getOrCreateWorkspace(context.db, context.session.user);
    const locked = !hasRoundPayments(workspacePlan(row));
    const { stripe } = context;
    if (!stripe || locked || row.stripeAccountId === null) {
      return {
        accountId: row.stripeAccountId,
        active: false,
        available: stripe !== null,
        locked,
      };
    }
    return {
      accountId: row.stripeAccountId,
      active: await refreshPaymentsActive(
        { db: context.db, stripe },
        { ...row, stripeAccountId: row.stripeAccountId }
      ),
      available: true,
      locked,
    };
  }),
};
