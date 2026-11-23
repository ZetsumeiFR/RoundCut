import { handleStripeEvent } from "@roundcut/api/extra-round-payment";
import { handleSubscriptionEvent } from "@roundcut/api/subscription";

import { ENV } from "@/env.server";
import { db, notifications, stripe } from "@/services";

// Stripe events: the editors' connected accounts (EXTRA-04, extra round
// payments) and RoundCut's own account (SUB-01, subscriptions). Each Stripe
// endpoint has its own signing secret; only events signed with one of them
// are processed. Handling is idempotent, so Stripe's retries are harmless.
const SECRETS = [
  ENV.STRIPE_WEBHOOK_SECRET,
  ENV.STRIPE_BILLING_WEBHOOK_SECRET,
].filter((secret): secret is string => Boolean(secret));

// The event if one of the endpoints' secrets verifies its signature.
async function verifiedEvent(
  client: NonNullable<typeof stripe>,
  payload: string,
  signature: string
) {
  const results = await Promise.allSettled(
    SECRETS.map((secret) =>
      client.webhooks.constructEventAsync(payload, signature, secret)
    )
  );
  const verified = results.find((result) => result.status === "fulfilled");
  return verified?.status === "fulfilled" ? verified.value : null;
}

export async function POST(request: Request) {
  if (!stripe || SECRETS.length === 0) {
    return new Response("Not found", { status: 404 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }
  const event = await verifiedEvent(stripe, await request.text(), signature);
  if (!event) {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.account) {
    await handleStripeEvent(db, notifications, event);
  } else {
    await handleSubscriptionEvent(db, stripe, event);
  }
  return Response.json({ received: true });
}
