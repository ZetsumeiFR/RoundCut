import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { ReviewerCodePurpose } from "../reviewer-code";
import { reviewer } from "./reviewer";

// The 6-digit code emailed to a reviewer to prove their email before an
// agreement (EXTRA-02, later APPR-01). Only its hash is kept, one live code
// per reviewer and purpose: asking again replaces it, a wrong guess counts
// as an attempt and a right one deletes it.
export const reviewerCode = pgTable(
  "reviewer_code",
  {
    attempts: integer("attempts").default(0).notNull(),
    codeHash: text("code_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purpose: text("purpose").$type<ReviewerCodePurpose>().notNull(),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => reviewer.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("reviewer_code_reviewer_id_purpose_idx").on(
      table.reviewerId,
      table.purpose
    ),
  ]
);
