import { ORPCError } from "@orpc/server";
import { PLAN_MAX_FILE_BYTES } from "@roundcut/db/plan";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { and, eq, max, ne } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { isSupportedMedia, readMedia } from "../media";
import {
  createUploadSchema,
  MULTIPART_THRESHOLD_BYTES,
  PART_SIZE_BYTES,
  partCount,
  signPartsSchema,
  UPLOAD_FORMATS,
  uploadFormat,
} from "../upload";
import { findOwnedDeliverable, findOwnedVersion, toVersion } from "./version";
import { getOrCreateWorkspace } from "./workspace";

type VersionRow = typeof version.$inferSelect;

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown) =>
  error instanceof Error &&
  (error.cause as { code?: string } | undefined)?.code === UNIQUE_VIOLATION;

const versionInput = z.object({ versionId: z.string().min(1) });

// Only uploads still in flight can be signed, resumed, completed or aborted.
const requireUploading = (row: VersionRow) => {
  if (row.status !== "uploading") {
    throw new ORPCError("CONFLICT", { message: "Upload already completed" });
  }
  return row;
};

const multipartPlan = (row: VersionRow) => ({
  kind: "multipart" as const,
  partCount: partCount(row.sizeBytes),
  partSize: PART_SIZE_BYTES,
});

export const uploadRouter = {
  abort: protectedProcedure
    .input(versionInput)
    .handler(async ({ context, input: { versionId } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = requireUploading(
        await findOwnedVersion(context.db, workspace.id, versionId)
      );
      if (row.uploadId) {
        await context.storage.abortMultipart(row.r2Key, row.uploadId);
      } else {
        await context.storage.deleteObject(row.r2Key);
      }
      await context.db.delete(version).where(eq(version.id, row.id));
      return { id: row.id };
    }),
  completeUpload: protectedProcedure
    .input(versionInput)
    .handler(async ({ context, input: { versionId } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = requireUploading(
        await findOwnedVersion(context.db, workspace.id, versionId)
      );
      if (row.uploadId) {
        // Completing with missing parts would store a truncated file and
        // consume the upload: check first so the browser can still resume.
        const uploaded = await context.storage.uploadedParts(
          row.r2Key,
          row.uploadId
        );
        if (uploaded.length !== partCount(row.sizeBytes)) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Some parts are still missing",
          });
        }
        await context.storage.completeMultipart(row.r2Key, row.uploadId);
      }
      const size = await context.storage.objectSize(row.r2Key);
      if (size !== row.sizeBytes) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Stored file doesn't match the upload",
        });
      }
      // The browser checks codecs before sending; this catches files that
      // bypassed it. A refused file is removed with its version.
      const format = uploadFormat(row.fileName);
      const media = await readMedia(
        (offset, length) =>
          context.storage.readRange(row.r2Key, offset, length),
        size
      );
      if (!(format && media?.video && isSupportedMedia(format, media.tracks))) {
        await context.storage.deleteObject(row.r2Key);
        await context.db.delete(version).where(eq(version.id, row.id));
        throw new ORPCError("UNSUPPORTED_MEDIA_TYPE", {
          data: { tracks: media?.tracks ?? null },
          message:
            "Only H.264 MP4 (AAC audio) and H.264 MOV files are accepted",
        });
      }
      const { video } = media;
      // Publishing the version opens the next round and closes the running
      // one (§7.2): all or nothing, so a version never lacks its round.
      return await context.db.transaction(async (tx) => {
        const [ready] = await tx
          .update(version)
          // The stored file's own header is the record, whatever the browser
          // displayed; only the frame rate is the editor's declaration.
          .set({
            durationMs: video.durationMs,
            height: video.height,
            status: "ready",
            uploadId: null,
            width: video.width,
          })
          .where(and(eq(version.id, row.id), eq(version.status, "uploading")))
          .returning();
        if (!ready) {
          throw new ORPCError("CONFLICT", {
            message: "Upload already completed",
          });
        }
        await tx
          .update(round)
          .set({
            closedAt: new Date(),
            closedReason: "next_version",
            status: "closed",
          })
          .where(
            and(
              eq(round.deliverableId, ready.deliverableId),
              ne(round.status, "closed")
            )
          );
        const [last] = await tx
          .select({ number: max(round.number) })
          .from(round)
          .where(eq(round.deliverableId, ready.deliverableId));
        const [opened] = await tx
          .insert(round)
          .values({
            deliverableId: ready.deliverableId,
            number: (last?.number ?? 0) + 1,
            versionId: ready.id,
          })
          .returning({ number: round.number });
        if (!opened) {
          throw new Error("Round insert returned no row");
        }
        return { ...toVersion(ready), round: opened };
      });
    }),
  createUpload: protectedProcedure
    .input(createUploadSchema)
    .handler(async ({ context, input }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const format = uploadFormat(input.fileName);
      if (!format) {
        throw new ORPCError("UNSUPPORTED_MEDIA_TYPE", {
          data: { tracks: null },
          message: "Only MP4 and MOV files are accepted",
        });
      }
      const maxBytes = PLAN_MAX_FILE_BYTES[workspace.plan];
      if (input.sizeBytes > maxBytes) {
        throw new ORPCError("PAYLOAD_TOO_LARGE", {
          data: { maxBytes },
          message: `Files are limited to ${maxBytes} bytes on this plan`,
        });
      }
      const owned = await findOwnedDeliverable(
        context.db,
        workspace.id,
        input.deliverableId
      );
      const id = crypto.randomUUID();
      const contentType = UPLOAD_FORMATS[format];
      const [last] = await context.db
        .select({ number: max(version.number) })
        .from(version)
        .where(eq(version.deliverableId, owned.id));
      let row: VersionRow | undefined;
      try {
        [row] = await context.db
          .insert(version)
          .values({
            contentType,
            deliverableId: owned.id,
            fileName: input.fileName,
            fps: input.frameRate,
            id,
            number: (last?.number ?? 0) + 1,
            r2Key: `${workspace.id}/${owned.id}/${id}.${format}`,
            sizeBytes: input.sizeBytes,
            uploadedBy: context.session.user.id,
          })
          .returning();
      } catch (error) {
        // The partial unique index allows one upload in flight per deliverable.
        if (isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            cause: error,
            message: "An upload is already in progress for this deliverable",
          });
        }
        throw error;
      }
      if (!row) {
        throw new Error("Version insert returned no row");
      }
      if (row.sizeBytes <= MULTIPART_THRESHOLD_BYTES) {
        return {
          upload: {
            kind: "single" as const,
            url: await context.storage.signPut(row.r2Key, row.contentType),
          },
          version: toVersion(row),
        };
      }
      try {
        const uploadId = await context.storage.createMultipart(
          row.r2Key,
          row.contentType
        );
        const [started] = await context.db
          .update(version)
          .set({ uploadId })
          .where(eq(version.id, row.id))
          .returning();
        if (!started) {
          throw new Error("Version update returned no row");
        }
        return { upload: multipartPlan(started), version: toVersion(started) };
      } catch (error) {
        await context.db.delete(version).where(eq(version.id, row.id));
        throw error;
      }
    }),
  // Picks an interrupted upload back up: multipart uploads report the parts
  // already stored; single uploads restart with a fresh URL.
  resumeUpload: protectedProcedure
    .input(versionInput)
    .handler(async ({ context, input: { versionId } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = requireUploading(
        await findOwnedVersion(context.db, workspace.id, versionId)
      );
      if (!row.uploadId) {
        return {
          upload: {
            kind: "single" as const,
            url: await context.storage.signPut(row.r2Key, row.contentType),
          },
          uploadedParts: [],
          version: toVersion(row),
        };
      }
      return {
        upload: multipartPlan(row),
        uploadedParts: await context.storage.uploadedParts(
          row.r2Key,
          row.uploadId
        ),
        version: toVersion(row),
      };
    }),
  signParts: protectedProcedure
    .input(signPartsSchema)
    .handler(async ({ context, input: { partNumbers, versionId } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = requireUploading(
        await findOwnedVersion(context.db, workspace.id, versionId)
      );
      const { uploadId } = row;
      if (!uploadId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Not a multipart upload",
        });
      }
      const total = partCount(row.sizeBytes);
      if (partNumbers.some((partNumber) => partNumber > total)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `This upload has ${total} parts`,
        });
      }
      return await Promise.all(
        partNumbers.map(async (partNumber) => ({
          partNumber,
          url: await context.storage.signPart(row.r2Key, uploadId, partNumber),
        }))
      );
    }),
};
