import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { project } from "./project";

// The link a client opens to review a project, /r/{token} (REV-01). Only the
// SHA-256 hash of the token is stored, so the URL can't be read back from the
// database. Revoked links are kept (revokedAt) rather than deleted; the
// project has at most one link that isn't revoked.
export const reviewLink = pgTable(
  "review_link",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    revokedAt: timestamp("revoked_at"),
    tokenHash: text("token_hash").notNull(),
  },
  (table) => [
    uniqueIndex("review_link_token_hash_idx").on(table.tokenHash),
    uniqueIndex("review_link_project_id_active_idx")
      .on(table.projectId)
      .where(sql`${table.revokedAt} is null`),
    index("review_link_project_id_idx").on(table.projectId),
  ]
);
