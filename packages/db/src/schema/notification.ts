import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { NotificationPayload, NotificationType } from "../notification";
import { user } from "./auth";

// An event for a workspace user (NOTIF-01): read in the app (NOTIF-02) and,
// for comments, grouped in the email of the next 15-minute run. emailedAt is
// set when that email claims the row.
export const notification = pgTable(
  "notification",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    emailedAt: timestamp("emailed_at"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    readAt: timestamp("read_at"),
    type: text("type").$type<NotificationType>().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("notification_user_id_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
    index("notification_type_emailed_at_idx").on(table.type, table.emailedAt),
  ]
);
