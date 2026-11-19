import type { Database } from "@roundcut/db";
import { offerAmounts } from "@roundcut/db/extra-round";
import { canGiftRound } from "@roundcut/db/round";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { extraRoundOffer } from "@roundcut/db/schema/extra-round-offer";
import { project } from "@roundcut/db/schema/project";
import { round } from "@roundcut/db/schema/round";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type Stripe from "stripe";

import { projectRoundPositions } from "./routers/round";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// A paid offer grants the round open on its deliverable when that round is
// the one waiting for the agreement (beyond the included ones, neither
// gifted nor granted yet): it becomes an extra round and its batch can be
// submitted. Otherwise the offer waits for the next version's round.
async function openPaidRound(db: Database, offerId: string) {
  const [paid] = await db
    .select({
      deliverableId: extraRoundOffer.deliverableId,
      projectId: deliverable.projectId,
      terms: project.termsSnapshot,
    })
    .from(extraRoundOffer)
    .innerJoin(deliverable, eq(extraRoundOffer.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .where(
      and(
        eq(extraRoundOffer.id, offerId),
        isNotNull(extraRoundOffer.paidAt),
        isNull(extraRoundOffer.roundId)
      )
    );
  if (!paid) {
    return;
  }
  const [open] = await db
    .select({ id: round.id, kind: round.kind, status: round.status })
    .from(round)
    .where(
      and(eq(round.deliverableId, paid.deliverableId), eq(round.status, "open"))
    );
  const position = open
    ? (await projectRoundPositions(db, paid.projectId)).get(open.id)
    : undefined;
  if (
    !(
      open &&
      position !== undefined &&
      canGiftRound({ ...open, position }, paid.terms.includedRounds)
    )
  ) {
    return;
  }
  await db.transaction(async (tx) => {
    const [granted] = await tx
      .update(extraRoundOffer)
      .set({ roundId: open.id })
      .where(
        and(eq(extraRoundOffer.id, offerId), isNull(extraRoundOffer.roundId))
      )
      .returning({ id: extraRoundOffer.id });
    if (!granted) {
      return;
    }
    await grantExtraRound(tx, open.id);
  });
}

async function grantExtraRound(tx: Transaction, roundId: string) {
  await tx
    .update(round)
    .set({ kind: "extra" })
    .where(and(eq(round.id, roundId), eq(round.kind, "included")));
}

// When a version opens a new round (VER-04), an offer the client already
// paid while no round was open for it is granted on that round.
export async function grantPaidOfferOnNewRound(
  tx: Transaction,
  opened: { deliverableId: string; roundId: string }
) {
  const [granted] = await tx
    .update(extraRoundOffer)
    .set({ roundId: opened.roundId })
    .where(
      and(
        eq(extraRoundOffer.deliverableId, opened.deliverableId),
        eq(extraRoundOffer.status, "accepted"),
        isNotNull(extraRoundOffer.paidAt),
        isNull(extraRoundOffer.roundId)
      )
    )
    .returning({ id: extraRoundOffer.id });
  if (granted) {
    await grantExtraRound(tx, opened.roundId);
  }
}

// A Checkout Session paid on an editor's connected account (EXTRA-04): the
// offer it names is marked paid once, and only when the session belongs to
// that editor's account and charged the offer's total in its currency.
async function fulfillCheckoutSession(
  db: Database,
  session: Stripe.Checkout.Session,
  accountId: string
) {
  const offerId = session.metadata?.offerId;
  if (!offerId || session.payment_status !== "paid") {
    return;
  }
  const [offer] = await db
    .select({
      accountId: workspace.stripeAccountId,
      currency: extraRoundOffer.currency,
      priceCents: extraRoundOffer.priceCents,
      status: extraRoundOffer.status,
      vatRateBps: extraRoundOffer.vatRateBps,
    })
    .from(extraRoundOffer)
    .innerJoin(deliverable, eq(extraRoundOffer.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(eq(extraRoundOffer.id, offerId));
  const matches =
    offer !== undefined &&
    offer.status === "accepted" &&
    offer.accountId === accountId &&
    session.currency === offer.currency.toLowerCase() &&
    session.amount_total ===
      offerAmounts(offer.priceCents, offer.vatRateBps).grossCents;
  if (!matches) {
    console.error("Stripe checkout session doesn't match its offer", {
      accountId,
      offerId,
      sessionId: session.id,
    });
    return;
  }
  await db
    .update(extraRoundOffer)
    .set({ paidAt: new Date(), stripeCheckoutSessionId: session.id })
    .where(
      and(eq(extraRoundOffer.id, offerId), isNull(extraRoundOffer.paidAt))
    );
  // Also run on redeliveries, so a round left closed by a failure between
  // the two steps still opens.
  await openPaidRound(db, offerId);
}

// Events of /api/webhooks/stripe, already verified against the signing
// secret. Payments are confirmed on the connected account's events only;
// delayed payment methods complete unpaid and succeed later.
export async function handleStripeEvent(db: Database, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (event.account) {
        await fulfillCheckoutSession(db, event.data.object, event.account);
      }
      return;
    default:
      return;
  }
}
