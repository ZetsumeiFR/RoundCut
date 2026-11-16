import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { VersionStatus } from "../version";
import { user } from "./auth";
import { deliverable } from "./deliverable";

// A file uploaded for a deliverable (V1, V2…). The row exists while the
// browser uploads straight to object storage (R2) and turns "ready" once the
// object is confirmed; multipart uploads keep their storage upload id until
// then so they can be resumed or aborted.
export const version = pgTable(
  "version",
  {
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverable.id, { onDelete: "cascade" }),
    durationMs: integer("duration_ms"),
    fileName: text("file_name").notNull(),
    fps: integer("fps"),
    height: integer("height"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    number: integer("number").notNull(),
    r2Key: text("r2_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status")
      .$type<VersionStatus>()
      .default("uploading")
      .notNull(),
    thumbnailKey: text("thumbnail_key"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    uploadId: text("upload_id"),
    width: integer("width"),
  },
  (table) => [
    uniqueIndex("version_deliverable_id_number_idx").on(
      table.deliverableId,
      table.number
    ),
    // One upload in flight per deliverable keeps version numbers gapless.
    uniqueIndex("version_deliverable_id_uploading_idx")
      .on(table.deliverableId)
      .where(sql`${table.status} = 'uploading'`),
    index("version_uploaded_by_idx").on(table.uploadedBy),
  ]
);
