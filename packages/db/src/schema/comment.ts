import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { CommentAuthorType, CommentStatus } from "../comment";
import { user } from "./auth";
import { reviewer } from "./reviewer";
import { round } from "./round";
import { version } from "./version";

// A timestamped comment on a version (REV-03): a point, or a range when
// endTimecodeMs is set. The author is a reviewer of the review link or, for
// replies (REV-04), a workspace user. roundId is the round open on the version
// when the comment was written, null once none is (REV-06 pending comments).
export const comment = pgTable(
  "comment",
  {
    attachmentKey: text("attachment_key"),
    authorType: text("author_type").$type<CommentAuthorType>().notNull(),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    endTimecodeMs: integer("end_timecode_ms"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentId: text("parent_id").references((): AnyPgColumn => comment.id, {
      onDelete: "cascade",
    }),
    rejectReason: text("reject_reason"),
    reviewerId: text("reviewer_id").references(() => reviewer.id, {
      onDelete: "set null",
    }),
    roundId: text("round_id").references(() => round.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<CommentStatus>().default("open").notNull(),
    timecodeMs: integer("timecode_ms").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    versionId: text("version_id")
      .notNull()
      .references(() => version.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("comment_version_id_timecode_ms_idx").on(
      table.versionId,
      table.timecodeMs
    ),
    index("comment_round_id_idx").on(table.roundId),
    index("comment_reviewer_id_idx").on(table.reviewerId),
  ]
);
