import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { RevisionTerms } from "../revision-terms";
import { workspace } from "./workspace";

// A customer of the workspace (CLI-01). The decider is the only reviewer
// allowed to accept a paid round or approve a version; reviewer emails list
// the other people allowed on the review link. SIREN and address are only
// used by the billing export. Archived clients leave every list but keep
// their history.
export const client = pgTable(
  "client",
  {
    address: text("address"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deciderEmail: text("decider_email").notNull(),
    deciderName: text("decider_name").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    notes: text("notes"),
    reviewerEmails: text("reviewer_emails").array().default([]).notNull(),
    // Plan terms of this client (CLI-03). They take precedence over the
    // workspace defaults; null means the client follows those defaults.
    revisionTerms: jsonb("revision_terms").$type<RevisionTerms>(),
    siren: text("siren"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
  },
  (table) => [index("client_workspace_id_idx").on(table.workspaceId)]
);
