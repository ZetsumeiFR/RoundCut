import { ORPCError } from "@orpc/server";
import { version } from "@roundcut/db/schema/version";
import { and, eq, max } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import {
  createUploadSchema,
  MULTIPART_THRESHOLD_BYTES,
  PART_SIZE_BYTES,
  partCount,
  signPartsSchema,
} from "../upload";
import { findOwnedDeliverable, findOwnedVersion, toVersion } from "./version";
import { getOrCreateWorkspace } from "./workspace";

type VersionRow = typeof version.$inferSelect;

const UNIQUE_VIOLATION = "23505";
const EXTENSION = /\.[a-z0-9]{1,8}$/i;

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
      const [ready] = await context.db
        .update(version)
        .set({ status: "ready", uploadId: null })
        .where(and(eq(version.id, row.id), eq(version.status, "uploading")))
        .returning();
      if (!ready) {
        throw new ORPCError("CONFLICT", {
          message: "Upload already completed",
        });
      }
      return toVersion(ready);
    }),
  createUpload: protectedProcedure
    .input(createUploadSchema)
    .handler(async ({ context, input }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const owned = await findOwnedDeliverable(
        context.db,
        workspace.id,
        input.deliverableId
      );
      const id = crypto.randomUUID();
      const extension = EXTENSION.exec(input.fileName)?.[0].toLowerCase() ?? "";
      const [last] = await context.db
        .select({ number: max(version.number) })
        .from(version)
        .where(eq(version.deliverableId, owned.id));
      let row: VersionRow | undefined;
      try {
        [row] = await context.db
          .insert(version)
          .values({
            contentType: input.contentType,
            deliverableId: owned.id,
            fileName: input.fileName,
            id,
            number: (last?.number ?? 0) + 1,
            r2Key: `${workspace.id}/${owned.id}/${id}${extension}`,
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
