import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { NotificationChannel, NotificationType } from "../notification";
import { user } from "./auth";

// A user's choice for one notification type on one channel (NOTIF-03). No
// row means the default: on.
export const notificationPreference = pgTable(
  "notification_preference",
  {
    channel: text("channel").$type<NotificationChannel>().notNull(),
    enabled: boolean("enabled").notNull(),
    type: text("type").$type<NotificationType>().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.type, table.channel] }),
  ]
);
