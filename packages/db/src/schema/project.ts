import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { ProjectStatus } from "../project-status";
import type { RevisionTerms } from "../revision-terms";
import { client } from "./client";
import { workspace } from "./workspace";

// A piece of work delivered to a client (PRJ-01). The plan terms are copied
// when the project is created, so later changes to the client or workspace
// defaults never rewrite what was agreed for this project. The flat fee is
// optional and only feeds the billing export.
export const project = pgTable(
  "project",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    flatFeeCents: integer("flat_fee_cents"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    status: text("status").$type<ProjectStatus>().default("draft").notNull(),
    targetDate: date("target_date", { mode: "string" }),
    termsSnapshot: jsonb("terms_snapshot").$type<RevisionTerms>().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("project_workspace_id_idx").on(table.workspaceId),
    index("project_client_id_idx").on(table.clientId),
  ]
);
