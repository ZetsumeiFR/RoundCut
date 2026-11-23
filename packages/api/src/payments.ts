import {
  hasRoundPayments,
  type PlanState,
  workspacePlan,
} from "@roundcut/db/plan";
import Stripe from "stripe";

// Stripe Connect (EXTRA-04): RoundCut is the platform, each editor connects
// their own Stripe account (Accounts v2, full Dashboard, Stripe owns fees and
// losses) and the client pays an extra round by a direct charge on it.
// Without STRIPE_SECRET_KEY the instance has no online payment at all.
export type StripeClient = Stripe;

export const createStripe = (env: { STRIPE_SECRET_KEY?: string }) =>
  env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

// Whether an editor's connected account can take card payments now: its
// merchant card_payments capability is active (the v2 status, not the
// deprecated charges_enabled).
export async function fetchPaymentsActive(
  stripe: StripeClient,
  accountId: string
) {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant"],
  });
  return (
    account.configuration?.merchant?.capabilities?.card_payments?.status ===
    "active"
  );
}

// Whether the client is asked to pay an extra round online: the terms say
// so, and the editor's plan and connected account allow it. Otherwise the
// editor invoices the round themselves.
export const canTakeRoundPayments = (
  stripe: StripeClient | null,
  workspace: PlanState & {
    stripeAccountId: string | null;
    stripePaymentsActive: boolean;
  }
) =>
  stripe !== null &&
  hasRoundPayments(workspacePlan(workspace)) &&
  workspace.stripeAccountId !== null &&
  workspace.stripePaymentsActive;
