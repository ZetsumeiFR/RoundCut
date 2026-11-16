import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { project } from "./project";

// A person who identified on a project's review link (REV-02) with a name and
// an email; one row per email and project. The decider is the client's
// decider email. verifiedAt is set once the email is proven by a code
// (EXTRA-02), never by the identification alone.
export const reviewer = pgTable(
  "reviewer",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    email: text("email").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    isDecider: boolean("is_decider").default(false).notNull(),
    name: text("name").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // Last "unsubmitted feedback" reminder (ROUND-04); a comment written
    // after it arms the next one.
    unsubmittedReminderSentAt: timestamp("unsubmitted_reminder_sent_at"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    verifiedAt: timestamp("verified_at"),
  },
  (table) => [
    uniqueIndex("reviewer_project_id_email_idx").on(
      table.projectId,
      table.email
    ),
    index("reviewer_project_id_idx").on(table.projectId),
  ]
);
