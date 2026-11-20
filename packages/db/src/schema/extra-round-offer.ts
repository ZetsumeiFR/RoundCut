import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { ExtraRoundOfferStatus, ExtraRoundSize } from "../extra-round";
import { deliverable } from "./deliverable";
import { reviewer } from "./reviewer";
import { round } from "./round";

// An extra round proposed to the client once the included rounds of a
// deliverable are used up (EXTRA-01, §7.3). Price, VAT rate, currency, delay
// and payment requirement are copied from the project's terms and workspace
// when the offer is made, so what the client agrees to never moves. Only the
// decider accepts it, with an email code (EXTRA-02).
export const extraRoundOffer = pgTable(
  "extra_round_offer",
  {
    acceptedAt: timestamp("accepted_at"),
    acceptedByReviewerId: text("accepted_by_reviewer_id").references(
      () => reviewer.id,
      { onDelete: "set null" }
    ),
    // The decider's message to the editor after declining (EXTRA-06), and
    // when it was emailed; at most one per declined offer.
    contactedAt: timestamp("contacted_at"),
    contactMessage: text("contact_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currency: text("currency").notNull(),
    // Trace of the decider declining the offer (EXTRA-06): when, by whom,
    // and the round it was declined on, which keeps the answer standing
    // until the next version opens a new round.
    declinedAt: timestamp("declined_at"),
    declinedByReviewerId: text("declined_by_reviewer_id").references(
      () => reviewer.id,
      { onDelete: "set null" }
    ),
    declinedRoundId: text("declined_round_id").references(() => round.id, {
      onDelete: "set null",
    }),
    delayDays: integer("delay_days").notNull(),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    // Last time a reviewer forwarded the offer to the decider (EXTRA-02).
    forwardedAt: timestamp("forwarded_at"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // The light round's price (EXTRA-08), excluding VAT, in cents; null when
    // the terms offer the full round only.
    lightPriceCents: integer("light_price_cents"),
    // When the client's payment of the offer was confirmed by Stripe
    // (EXTRA-04, checkout.session.completed); null while unpaid.
    paidAt: timestamp("paid_at"),
    // Excluding VAT, in cents: the full round's price while proposed, then
    // the price of the size the decider accepted, which is what is paid,
    // invoiced and shown on the receipt.
    priceCents: integer("price_cents").notNull(),
    requirePayment: boolean("require_payment").notNull(),
    // The round an accepted offer opened (EXTRA-04, EXTRA-05); null while
    // the accepted offer waits for its payment or opening.
    roundId: text("round_id").references(() => round.id, {
      onDelete: "set null",
    }),
    // The size the decider accepted (EXTRA-08); null until accepted.
    size: text("size").$type<ExtraRoundSize>(),
    status: text("status")
      .$type<ExtraRoundOfferStatus>()
      .default("proposed")
      .notNull(),
    // The latest Checkout Session opened on the editor's Stripe account to
    // pay the offer, reused while it is still open.
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    // Basis points (2000 = 20 %), like the workspace's default rate.
    vatRateBps: integer("vat_rate_bps").notNull(),
  },
  (table) => [
    // At most one offer waiting for an answer per deliverable.
    uniqueIndex("extra_round_offer_deliverable_id_proposed_idx")
      .on(table.deliverableId)
      .where(sql`${table.status} = 'proposed'`),
  ]
);
