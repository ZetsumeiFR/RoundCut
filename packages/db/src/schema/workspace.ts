import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { DEFAULT_REVISION_TERMS, type RevisionTerms } from "../revision-terms";
import { user } from "./auth";

// One workspace per account (WS-01). The VAT rate is stored in basis points
// (2000 = 20 %) to keep two-decimal rates exact.
export const workspace = pgTable("workspace", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  currency: text("currency").default("EUR").notNull(),
  defaultVatRateBps: integer("default_vat_rate_bps").default(2000).notNull(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  locale: text("locale").default("fr").notNull(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  revisionTerms: jsonb("revision_terms")
    .$type<RevisionTerms>()
    .default(DEFAULT_REVISION_TERMS)
    .notNull(),
  timezone: text("timezone").default("Europe/Paris").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
