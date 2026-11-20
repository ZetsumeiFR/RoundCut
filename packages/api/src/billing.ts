import z from "zod";

import { PROJECT_FLAT_FEE_MAX_CENTS } from "./project";

export const BILLABLE_LINE_LABEL_MAX_LENGTH = 200;
export const BILLABLE_LINE_MAX_QUANTITY = 1000;

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
