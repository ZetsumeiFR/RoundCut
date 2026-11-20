import { ORPCError } from "@orpc/server";
import { LOCALES } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { version } from "@roundcut/db/schema/version";
import {
  CLIENT_DOWNLOAD_POLICIES,
  clientCanDownload,
} from "@roundcut/db/version";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { certificateFile, findCertificate } from "../certificate";
import { protectedProcedure } from "../index";
import type { Storage } from "../storage";
import type { FrameRate } from "../timecode";
import { getOrCreateWorkspace } from "./workspace";

type VersionRow = typeof version.$inferSelect;

export const toVersion = (row: VersionRow) => ({
  clientCanDownload: clientCanDownload(row.clientDownload, row.status),
  clientDownload: row.clientDownload,
  contentType: row.contentType,
  createdAt: row.createdAt,
  deliverableId: row.deliverableId,
  durationMs: row.durationMs,
  fileName: row.fileName,
  frameRate: row.fps as FrameRate | null,
  height: row.height,
  id: row.id,
  multipart: row.uploadId !== null,
  number: row.number,
  sizeBytes: row.sizeBytes,
  status: row.status,
  width: row.width,
});

// Thumbnails are private like videos: short-lived signed URLs (VER-06).
export const thumbnailUrl = (storage: Storage, thumbnailKey: string | null) =>
  thumbnailKey ? storage.signGet(thumbnailKey) : null;

export const withThumbnail = async (storage: Storage, row: VersionRow) => ({
  ...toVersion(row),
  thumbnailUrl: await thumbnailUrl(storage, row.thumbnailKey),
});

// Deliverables and versions of other workspaces read as missing so their ids
// leak nothing.
export async function findOwnedDeliverable(
  db: Database,
  workspaceId: string,
  deliverableId: string
) {
  const [row] = await db
    .select({ id: deliverable.id })
    .from(deliverable)
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .where(
      and(
        eq(deliverable.id, deliverableId),
        eq(project.workspaceId, workspaceId)
      )
    );
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Deliverable not found" });
  }
  return row;
}

export async function findOwnedVersion(
  db: Database,
  workspaceId: string,
  versionId: string
) {
  const [row] = await db
    .select({ version })
    .from(version)
    .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .where(
      and(eq(version.id, versionId), eq(project.workspaceId, workspaceId))
    );
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Version not found" });
  }
  return row.version;
}

const assertPublished = (row: VersionRow) => {
  if (row.status === "uploading") {
    throw new ORPCError("CONFLICT", {
      message: "Version is still uploading",
    });
  }
};

export const versionRouter = {
  // The validation certificate (APPR-04) once the client approved the version.
  approvalCertificate: protectedProcedure
    .input(z.object({ id: z.string().min(1), locale: z.enum(LOCALES) }))
    .handler(async ({ context, input }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = await findOwnedVersion(context.db, workspace.id, input.id);
      const certificate = await findCertificate(
        context.db,
        eq(consentRecord.versionId, row.id)
      );
      return certificateFile(certificate, input.locale);
    }),
  // The editor can always download the original file; the client's access
  // follows clientDownload (VER-07) once the review link exists (REV-01).
  downloadUrl: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input: { id } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = await findOwnedVersion(context.db, workspace.id, id);
      assertPublished(row);
      return { url: await context.storage.signGet(row.r2Key, row.fileName) };
    }),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input: { id } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      return await withThumbnail(
        context.storage,
        await findOwnedVersion(context.db, workspace.id, id)
      );
    }),
  list: protectedProcedure
    .input(z.object({ deliverableId: z.string().min(1) }))
    .handler(async ({ context, input: { deliverableId } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const owned = await findOwnedDeliverable(
        context.db,
        workspace.id,
        deliverableId
      );
      const rows = await context.db
        .select()
        .from(version)
        .where(eq(version.deliverableId, owned.id))
        .orderBy(desc(version.number));
      return await Promise.all(
        rows.map((row) => withThumbnail(context.storage, row))
      );
    }),
  // Short-lived read URL (at most one hour), regenerated on demand.
  playbackUrl: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input: { id } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = await findOwnedVersion(context.db, workspace.id, id);
      assertPublished(row);
      return { url: await context.storage.signGet(row.r2Key) };
    }),
  updateClientDownload: protectedProcedure
    .input(
      z.object({
        clientDownload: z.enum(CLIENT_DOWNLOAD_POLICIES),
        id: z.string().min(1),
      })
    )
    .handler(async ({ context, input: { clientDownload, id } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const row = await findOwnedVersion(context.db, workspace.id, id);
      assertPublished(row);
      const [updated] = await context.db
        .update(version)
        .set({ clientDownload })
        .where(eq(version.id, row.id))
        .returning();
      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Version not found" });
      }
      return await withThumbnail(context.storage, updated);
    }),
};
