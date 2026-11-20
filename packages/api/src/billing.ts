import { LOCALES } from "@roundcut/auth/locale";
import { BILLABLE_LINE_STATUSES } from "@roundcut/db/billing";
import z from "zod";

import { PROJECT_FLAT_FEE_MAX_CENTS } from "./project";

export const BILLABLE_LINE_LABEL_MAX_LENGTH = 200;
export const BILLABLE_LINE_MAX_QUANTITY = 1000;
export const BILLABLE_LINE_EXPORT_MAX = 5000;

// A fee the editor adds by hand to a project (BILL-01): travel, stock
// footage, music license… Billed in the workspace currency and VAT rate.
export const manualLineSchema = z.object({
  label: z.string().trim().min(1).max(BILLABLE_LINE_LABEL_MAX_LENGTH),
  projectId: z.string().min(1),
  quantity: z.int().min(1).max(BILLABLE_LINE_MAX_QUANTITY),
  // Excluding VAT, in cents.
  unitPriceCents: z.int().min(0).max(PROJECT_FLAT_FEE_MAX_CENTS),
});

export type ManualLineInput = z.input<typeof manualLineSchema>;

// The editor marks a line exported or paid by hand (BILL-02).
export const lineStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(BILLABLE_LINE_STATUSES),
});

// Export formats (BILL-05): the full CSV for any spreadsheet (BILL-04),
// Pennylane's invoice drafts import (.xlsx), and a per-client recap for
// Indy, Tiime and Freebe, which only take invoices entered one by one.
export const EXPORT_PRESETS = ["standard", "pennylane", "recap"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

// The lines the editor exports (BILL-04), in the page's language.
export const exportLinesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(BILLABLE_LINE_EXPORT_MAX),
  locale: z.enum(LOCALES),
  preset: z.enum(EXPORT_PRESETS).default("standard"),
});
