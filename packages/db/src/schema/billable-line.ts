import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { BillableLineSource, BillableLineStatus } from "../billing";
import { client } from "./client";
import { consentRecord } from "./consent-record";
import { project } from "./project";
import { workspace } from "./workspace";

// A line the editor invoices from their own tool (BILL, §8): an accepted
// extra round the client didn't pay online (EXTRA-05), later the project's
// flat fee and manual fees (BILL-01). Amounts are copied when the line is
// created, so it never moves with the terms.
export const billableLine = pgTable(
  "billable_line",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    // The agreement the line comes from (extra rounds): one line per
    // agreement.
    consentRecordId: text("consent_record_id").references(
      () => consentRecord.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currency: text("currency").notNull(),
    exportedAt: timestamp("exported_at"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label").notNull(),
    paidAt: timestamp("paid_at"),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    quantity: integer("quantity").default(1).notNull(),
    source: text("source").$type<BillableLineSource>().notNull(),
    status: text("status")
      .$type<BillableLineStatus>()
      .default("to_invoice")
      .notNull(),
    // Excluding VAT, in cents.
    unitPriceCents: integer("unit_price_cents").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    // Basis points (2000 = 20 %).
    vatRateBps: integer("vat_rate_bps").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("billable_line_workspace_id_status_created_at_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
    uniqueIndex("billable_line_consent_record_id_idx").on(
      table.consentRecordId
    ),
    index("billable_line_project_id_idx").on(table.projectId),
  ]
);
