import { LOCALES } from "@roundcut/auth/locale";
import { REVISION_SCOPES } from "@roundcut/db/revision-terms";
import z from "zod";

import {
  COMMENT_ATTACHMENT_TYPES,
  type CommentAttachmentType,
} from "./comment";

export const WORKSPACE_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
] as const;

export const WORKSPACE_NAME_MAX_LENGTH = 80;
export const VAT_RATE_MAX = 100;

export const isTimeZone = (value: string) =>
  Intl.supportedValuesOf("timeZone").includes(value);

export const workspaceSettingsSchema = z.object({
  currency: z.enum(WORKSPACE_CURRENCIES),
  defaultVatRate: z.number().min(0).max(VAT_RATE_MAX).multipleOf(0.01),
  locale: z.enum(LOCALES),
  name: z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH),
  timezone: z.string().refine(isTimeZone),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export const INCLUDED_ROUNDS_MAX = 10;
export const EXTRA_ROUND_PRICE_MAX_CENTS = 10_000_000;
export const EXTRA_ROUND_DELAY_MAX_DAYS = 90;

export const revisionTermsSchema = z.object({
  extraRoundDelayDays: z.int().min(0).max(EXTRA_ROUND_DELAY_MAX_DAYS),
  extraRoundPriceCents: z.int().min(0).max(EXTRA_ROUND_PRICE_MAX_CENTS),
  includedRounds: z.int().min(0).max(INCLUDED_ROUNDS_MAX),
  requirePayment: z.boolean(),
  scope: z.enum(REVISION_SCOPES),
});

// "Unsubmitted feedback" reminder to reviewers (ROUND-04): sent this many
// hours after their last comment that still waits to be submitted.
export const REVIEWER_REMINDER_MAX_HOURS = 14 * 24;

export const reviewerRemindersSchema = z.object({
  delayHours: z.int().min(1).max(REVIEWER_REMINDER_MAX_HOURS),
  enabled: z.boolean(),
});

export type ReviewerReminders = z.infer<typeof reviewerRemindersSchema>;

// "Version awaiting your feedback" reminder to the decider (ROUND-05): sent
// this many days after the round opened, then again after the same delay,
// at most DECIDER_REMINDER_MAX_SENDS times per round.
export const DECIDER_REMINDER_MAX_DAYS = 30;
export const DECIDER_REMINDER_MAX_SENDS = 2;

export const deciderRemindersSchema = z.object({
  delayDays: z.int().min(1).max(DECIDER_REMINDER_MAX_DAYS),
  enabled: z.boolean(),
});

export type DeciderReminders = z.infer<typeof deciderRemindersSchema>;

// White label of the review links (REV-10): the logo is a PNG, JPEG or
// WebP image (same formats as comment attachments) and the accent a hex color.
export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const BRAND_ACCENT_PATTERN = /^#[0-9a-f]{6}$/;

export const brandLogoUploadSchema = z.object({
  contentType: z.enum(
    Object.keys(COMMENT_ATTACHMENT_TYPES) as [
      CommentAttachmentType,
      ...CommentAttachmentType[],
    ]
  ),
  sizeBytes: z.int().min(1).max(BRAND_LOGO_MAX_BYTES),
});

export const brandingSchema = z.object({
  accentColor: z
    .string()
    .trim()
    .toLowerCase()
    .regex(BRAND_ACCENT_PATTERN)
    .nullable(),
  logoKey: z.string().min(1).nullable(),
});

export type Branding = z.infer<typeof brandingSchema>;

const LINEAR_THRESHOLD = 0.040_45;
const HEX_CHANNEL_STARTS = [1, 3, 5];
const LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722];
// Above this relative luminance, dark text reads better than white.
const LIGHT_LUMINANCE = 0.179;

// Text drawn on the accent color: black or white, whichever contrasts most
// (WCAG relative luminance).
export function accentForeground(hex: string) {
  const luminance = HEX_CHANNEL_STARTS.reduce((total, start, index) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    const linear =
      channel <= LINEAR_THRESHOLD
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    return total + linear * (LUMA_WEIGHTS[index] ?? 0);
  }, 0);
  return luminance > LIGHT_LUMINANCE ? "#0a0a0a" : "#ffffff";
}

export const onboardingSchema = workspaceSettingsSchema.extend({
  revisionTerms: revisionTermsSchema,
});
