import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type {
  ManualCloseReason,
  RoundClosedReason,
  RoundKind,
  RoundStatus,
} from "../round";
import { deliverable } from "./deliverable";
import { version } from "./version";

// A revision round of a deliverable (Round 1, Round 2…), opened on the
// version the client reviews. Rounds are never deleted: closing one keeps its
// dates and reason for the counter and the history.
export const round = pgTable(
  "round",
  {
    closedAt: timestamp("closed_at"),
    // Editor's note to the client when closing by hand (ROUND-03).
    closedNote: text("closed_note"),
    closedReason: text("closed_reason").$type<RoundClosedReason>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverable.id, { onDelete: "cascade" }),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").$type<RoundKind>().default("included").notNull(),
    // Set only when the editor closed the round (closedReason "manual").
    manualCloseReason: text("manual_close_reason").$type<ManualCloseReason>(),
    number: integer("number").notNull(),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    status: text("status").$type<RoundStatus>().default("open").notNull(),
    submittedAt: timestamp("submitted_at"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    versionId: text("version_id")
      .notNull()
      .references(() => version.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("round_deliverable_id_number_idx").on(
      table.deliverableId,
      table.number
    ),
    // At most one round still running (open or submitted) per deliverable.
    uniqueIndex("round_deliverable_id_active_idx")
      .on(table.deliverableId)
      .where(sql`${table.status} <> 'closed'`),
    index("round_version_id_idx").on(table.versionId),
  ]
);
