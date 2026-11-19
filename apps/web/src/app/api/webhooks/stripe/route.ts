import { handleStripeEvent } from "@roundcut/api/extra-round-payment";

import { ENV } from "@/env.server";
import { db, notifications, stripe } from "@/services";

// Stripe Connect events of the editors' accounts (EXTRA-04): the extra
// round payment confirmations. Only events signed with the endpoint's secret
// are processed; handling is idempotent, so Stripe's retries are harmless.
export async function POST(request: Request) {
  if (!(stripe && ENV.STRIPE_WEBHOOK_SECRET)) {
    return new Response("Not found", { status: 404 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }
  let event: Parameters<typeof handleStripeEvent>[2];
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      ENV.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  await handleStripeEvent(db, notifications, event);
  return Response.json({ received: true });
}
