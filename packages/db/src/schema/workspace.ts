import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { DEFAULT_PLAN, type Plan } from "../plan";
import { DEFAULT_REVISION_TERMS, type RevisionTerms } from "../revision-terms";
import { user } from "./auth";

// One workspace per account (WS-01). The VAT rate is stored in basis points
// (2000 = 20 %) to keep two-decimal rates exact.
export const workspace = pgTable("workspace", {
  // White label of the review links (REV-10, Pro and Studio): a #rrggbb
  // accent color and the storage key of the logo, null when unset.
  brandAccentColor: text("brand_accent_color"),
  brandLogoKey: text("brand_logo_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  currency: text("currency").default("EUR").notNull(),
  defaultVatRateBps: integer("default_vat_rate_bps").default(2000).notNull(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  locale: text("locale").default("fr").notNull(),
  name: text("name").notNull(),
  // Set when the owner finishes the onboarding (WS-03); null while skipped.
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  // Subscription plan (SUB-01); sets the upload limits (VER-02).
  plan: text("plan").$type<Plan>().default(DEFAULT_PLAN).notNull(),
  // Reminder emailed to a reviewer whose feedback still waits to be
  // submitted, this many hours after their last comment (ROUND-04).
  reviewerReminderEnabled: boolean("reviewer_reminder_enabled")
    .default(true)
    .notNull(),
  reviewerReminderHours: integer("reviewer_reminder_hours")
    .default(48)
    .notNull(),
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
