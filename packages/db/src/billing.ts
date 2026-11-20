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

// Statuses the editor may mark a line with from each status (BILL-02). An
// exported line can go back to "to invoice" when the export was a mistake;
// a paid line is final, whether the editor marked it or Stripe confirmed the
// online payment.
export const BILLABLE_LINE_STATUS_TRANSITIONS: Record<
  BillableLineStatus,
  readonly BillableLineStatus[]
> = {
  exported: ["to_invoice", "paid"],
  paid: [],
  to_invoice: ["exported", "paid"],
};

// Statuses from which a line may be marked `status`.
export const billableLineStatusSources = (status: BillableLineStatus) =>
  BILLABLE_LINE_STATUSES.filter((from) =>
    BILLABLE_LINE_STATUS_TRANSITIONS[from].includes(status)
  );
