import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { ExtraRoundOfferStatus } from "../extra-round";
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currency: text("currency").notNull(),
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
    // Excluding VAT, in cents.
    priceCents: integer("price_cents").notNull(),
    requirePayment: boolean("require_payment").notNull(),
    // The round an accepted offer opened (EXTRA-04, EXTRA-05); null while
    // the accepted offer waits for its payment or opening.
    roundId: text("round_id").references(() => round.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<ExtraRoundOfferStatus>()
      .default("proposed")
      .notNull(),
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
