import { LOCALES } from "@roundcut/auth/locale";
import z from "zod";

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
