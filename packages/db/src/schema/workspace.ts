import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { type BillingInterval, DEFAULT_PLAN, type Plan } from "../plan";
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
  // Reminder emailed to the client's decider while a version waits for
  // feedback, this many days after the round opened (ROUND-05).
  deciderReminderDays: integer("decider_reminder_days").default(3).notNull(),
  deciderReminderEnabled: boolean("decider_reminder_enabled")
    .default(true)
    .notNull(),
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
  // Subscription plan (SUB-01); sets the upload limits (VER-02). Kept in
  // sync with the RoundCut Stripe subscription by its webhook: its status,
  // interval, next renewal and whether it carries the Founder coupon.
  plan: text("plan").$type<Plan>().default(DEFAULT_PLAN).notNull(),
  planFounder: boolean("plan_founder").default(false).notNull(),
  planInterval: text("plan_interval").$type<BillingInterval>(),
  planRenewsAt: timestamp("plan_renews_at"),
  planStatus: text("plan_status"),
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
  // The editor's own Stripe account (EXTRA-04, Connect, Pro and Studio),
  // where clients pay extra rounds, and whether it can take card payments
  // yet (last known status of its card_payments capability).
  stripeAccountId: text("stripe_account_id"),
  // The workspace as a customer of RoundCut's own Stripe account (SUB-01),
  // and its current subscription.
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripePaymentsActive: boolean("stripe_payments_active")
    .default(false)
    .notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  timezone: text("timezone").default("Europe/Paris").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
