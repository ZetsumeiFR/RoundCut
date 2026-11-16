import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import { user } from "@roundcut/db/schema/auth";
import { comment } from "@roundcut/db/schema/comment";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { and, asc, eq, ne } from "drizzle-orm";
import z from "zod";

import {
  COMMENT_ATTACHMENT_MAX_BYTES,
  COMMENT_ATTACHMENT_TYPES,
  commentAttachmentSchema,
  commentSchema,
  IMAGE_SIGNATURE_BYTES,
  sniffImageType,
} from "../comment";
import {
  protectedProcedure,
  publicProcedure,
  requireReviewLink,
} from "../index";
import { reviewTokenSchema } from "../review-link";
import type { Storage } from "../storage";
import { findOwnedVersion } from "./version";
import { getOrCreateWorkspace } from "./workspace";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ATTACHMENT_EXTENSIONS = Object.values(COMMENT_ATTACHMENT_TYPES).join("|");

// Attachments live under their project so a key can't be borrowed from
// another review link.
const attachmentPrefix = (projectId: string) => `comments/${projectId}/`;

const isAttachmentKeyOf = (projectId: string, key: string) =>
  new RegExp(
    `^${attachmentPrefix(projectId)}${UUID}\\.(${ATTACHMENT_EXTENSIONS})$`
  ).test(key);

const reviewInput = z.object({ token: reviewTokenSchema });

// The reviewer must have identified (REV-02) before reading or writing
// feedback; requireReviewLink leaves them null otherwise.
const requireReviewer = <T>(reviewerOf: T | null) => {
  if (!reviewerOf) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Identify on the review link first",
    });
  }
  return reviewerOf;
};

// A published version of the linked project; anything else reads as missing.
async function findReviewVersion(
  db: Database,
  projectId: string,
  versionId: string
) {
  const [row] = await db
    .select({ version })
    .from(version)
    .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
    .where(
      and(
        eq(version.id, versionId),
        eq(deliverable.projectId, projectId),
        ne(version.status, "uploading")
      )
    );
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Version not found" });
  }
  return row.version;
}

const commentColumns = {
  attachmentKey: comment.attachmentKey,
  authorType: comment.authorType,
  body: comment.body,
  createdAt: comment.createdAt,
  editorName: user.name,
  endTimecodeMs: comment.endTimecodeMs,
  id: comment.id,
  reviewerName: reviewer.name,
  status: comment.status,
  timecodeMs: comment.timecodeMs,
};

type CommentRow = Pick<
  typeof comment.$inferSelect,
  | "attachmentKey"
  | "authorType"
  | "body"
  | "createdAt"
  | "endTimecodeMs"
  | "id"
  | "status"
  | "timecodeMs"
> & { editorName: string | null; reviewerName: string | null };

const toComment = async (storage: Storage, row: CommentRow) => ({
  attachmentUrl: row.attachmentKey
    ? await storage.signGet(row.attachmentKey)
    : null,
  authorName: row.authorType === "editor" ? row.editorName : row.reviewerName,
  authorType: row.authorType,
  body: row.body,
  createdAt: row.createdAt,
  endTimecodeMs: row.endTimecodeMs,
  id: row.id,
  status: row.status,
  timecodeMs: row.timecodeMs,
});

async function listComments(db: Database, storage: Storage, versionId: string) {
  const rows = await db
    .select(commentColumns)
    .from(comment)
    .leftJoin(reviewer, eq(comment.reviewerId, reviewer.id))
    .leftJoin(user, eq(comment.authorUserId, user.id))
    .where(eq(comment.versionId, versionId))
    .orderBy(asc(comment.timecodeMs), asc(comment.createdAt));
  return await Promise.all(rows.map((row) => toComment(storage, row)));
}

// The browser uploads the image through a presigned URL, so only a stored
// object of the project, small enough and really an image, is kept.
async function checkAttachment(
  storage: Storage,
  projectId: string,
  key: string
) {
  if (!isAttachmentKeyOf(projectId, key)) {
    throw new ORPCError("BAD_REQUEST", { message: "Unknown attachment" });
  }
  const size = await storage.objectSize(key);
  if (size === null) {
    throw new ORPCError("BAD_REQUEST", { message: "Attachment not uploaded" });
  }
  const head =
    size >= IMAGE_SIGNATURE_BYTES
      ? await storage.readRange(key, 0, IMAGE_SIGNATURE_BYTES)
      : new Uint8Array();
  if (size > COMMENT_ATTACHMENT_MAX_BYTES || sniffImageType(head) === null) {
    await storage.deleteObject(key);
    throw new ORPCError("BAD_REQUEST", {
      message: "Attachments must be PNG, JPEG or WebP images up to 5 MB",
    });
  }
}

const isWithin = (durationMs: number | null, timecodeMs: number | null) =>
  durationMs === null || timecodeMs === null || timecodeMs <= durationMs;

export const commentRouter = {
  // A reviewer's timestamped comment (REV-03) on a published version of the
  // linked project. It joins the round open on that version; without one it
  // waits for the next round (REV-06).
  create: publicProcedure
    .input(commentSchema.extend({ token: reviewTokenSchema }))
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const author = requireReviewer(context.reviewer);
      const { projectId } = context.reviewLink;
      const target = await findReviewVersion(
        context.db,
        projectId,
        input.versionId
      );
      if (
        !(
          isWithin(target.durationMs, input.timecodeMs) &&
          isWithin(target.durationMs, input.endTimecodeMs)
        )
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The timecode is past the end of the video",
        });
      }
      if (input.attachmentKey) {
        await checkAttachment(context.storage, projectId, input.attachmentKey);
      }
      const [openRound] = await context.db
        .select({ id: round.id })
        .from(round)
        .where(and(eq(round.versionId, target.id), eq(round.status, "open")));
      const [saved] = await context.db
        .insert(comment)
        .values({
          attachmentKey: input.attachmentKey,
          authorType: "reviewer",
          body: input.body,
          endTimecodeMs: input.endTimecodeMs,
          reviewerId: author.id,
          roundId: openRound?.id ?? null,
          timecodeMs: input.timecodeMs,
          versionId: target.id,
        })
        .returning();
      if (!saved) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
      return await toComment(context.storage, {
        ...saved,
        editorName: null,
        reviewerName: author.name,
      });
    }),

  list: protectedProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .handler(async ({ context, input: { versionId } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const owned = await findOwnedVersion(context.db, workspace.id, versionId);
      return await listComments(context.db, context.storage, owned.id);
    }),

  // Every reviewer of the link sees the whole thread of a version.
  listForReview: publicProcedure
    .input(reviewInput.extend({ versionId: z.string().min(1) }))
    .use(requireReviewLink)
    .handler(async ({ context, input: { versionId } }) => {
      requireReviewer(context.reviewer);
      const target = await findReviewVersion(
        context.db,
        context.reviewLink.projectId,
        versionId
      );
      return await listComments(context.db, context.storage, target.id);
    }),

  // Where the reviewer's browser uploads an image before creating the
  // comment that references it.
  signAttachment: publicProcedure
    .input(commentAttachmentSchema.extend({ token: reviewTokenSchema }))
    .use(requireReviewLink)
    .handler(async ({ context, input: { contentType, versionId } }) => {
      requireReviewer(context.reviewer);
      const { projectId } = context.reviewLink;
      await findReviewVersion(context.db, projectId, versionId);
      const key = `${attachmentPrefix(projectId)}${crypto.randomUUID()}.${COMMENT_ATTACHMENT_TYPES[contentType]}`;
      return { key, url: await context.storage.signPut(key, contentType) };
    }),
};
