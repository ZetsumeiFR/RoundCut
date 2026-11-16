import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { DeliverableAspect, DeliverableStatus } from "../deliverable";
import { project } from "./project";

// A video expected in a project (PRJ-02), e.g. "Reel #3". Position keeps the
// order the editor added them in; the target duration is optional.
export const deliverable = pgTable(
  "deliverable",
  {
    aspect: text("aspect").$type<DeliverableAspect>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    position: integer("position").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<DeliverableStatus>()
      .default("draft")
      .notNull(),
    targetDurationSeconds: integer("target_duration_seconds"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("deliverable_project_id_position_idx").on(
      table.projectId,
      table.position
    ),
  ]
);
