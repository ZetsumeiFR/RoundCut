import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { version } from "@roundcut/db/schema/version";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { getOrCreateWorkspace } from "./workspace";

type VersionRow = typeof version.$inferSelect;

export const toVersion = (row: VersionRow) => ({
  contentType: row.contentType,
  createdAt: row.createdAt,
  deliverableId: row.deliverableId,
  fileName: row.fileName,
  id: row.id,
  multipart: row.uploadId !== null,
  number: row.number,
  sizeBytes: row.sizeBytes,
  status: row.status,
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

export const versionRouter = {
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input: { id } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      return toVersion(await findOwnedVersion(context.db, workspace.id, id));
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
      return rows.map(toVersion);
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
      if (row.status === "uploading") {
        throw new ORPCError("CONFLICT", {
          message: "Version is still uploading",
        });
      }
      return { url: await context.storage.signGet(row.r2Key) };
    }),
};
