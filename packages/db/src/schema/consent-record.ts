import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { ConsentKind } from "../consent";
import { extraRoundOffer } from "./extra-round-offer";
import { project } from "./project";
import { version } from "./version";

// The immutable record of an agreement (EXTRA-03): who agreed (identity and
// email, copied rather than linked so removing the reviewer never rewrites
// it), when (UTC), from where (IP, user-agent), and a snapshot of the text
// and amounts shown, sealed by the SHA-256 of its canonical JSON. Rows are
// only ever inserted: no code path updates them, and they go away only with
// their project (account deletion).
export const consentRecord = pgTable(
  "consent_record",
  {
    createdAt: timestamp("created_at").notNull(),
    email: text("email").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ip: text("ip"),
    kind: text("kind").$type<ConsentKind>().notNull(),
    name: text("name").notNull(),
    // The extra round offer agreed to (one record per offer).
    offerId: text("offer_id").references(() => extraRoundOffer.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    // Hex SHA-256 of the snapshot's canonical JSON (sorted keys).
    snapshotHash: text("snapshot_hash").notNull(),
    userAgent: text("user_agent"),
    // The version approved (kind "approval", one record per version).
    versionId: text("version_id").references(() => version.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    uniqueIndex("consent_record_offer_id_idx").on(table.offerId),
    uniqueIndex("consent_record_version_id_idx").on(table.versionId),
    index("consent_record_project_id_idx").on(table.projectId),
  ]
);
