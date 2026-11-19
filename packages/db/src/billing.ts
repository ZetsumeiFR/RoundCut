// Billable lines (BILL, §6.10, §8 billable_line). Client-safe: no drizzle
// import. Lines are exported to the editor's invoicing tool, never invoiced
// by RoundCut: "to_invoice" -> "exported" -> "paid" (BILL-02).
export const BILLABLE_LINE_SOURCES = [
  "flat_fee",
  "extra_round",
  "manual",
] as const;

export type BillableLineSource = (typeof BILLABLE_LINE_SOURCES)[number];

export const BILLABLE_LINE_STATUSES = [
  "to_invoice",
  "exported",
  "paid",
] as const;

export type BillableLineStatus = (typeof BILLABLE_LINE_STATUSES)[number];
