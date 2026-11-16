import { ORPCError } from "@orpc/server";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { and, eq, max } from "drizzle-orm";
import z from "zod";

import { deliverableSchema } from "../deliverable";
import { protectedProcedure } from "../index";
import { getOrCreateWorkspace } from "./workspace";

type DeliverableRow = typeof deliverable.$inferSelect;

export const toDeliverable = (row: DeliverableRow) => ({
  aspect: row.aspect,
  createdAt: row.createdAt,
  id: row.id,
  position: row.position,
  status: row.status,
  targetDurationSeconds: row.targetDurationSeconds,
  title: row.title,
});

export const deliverableRouter = {
  create: protectedProcedure
    .input(deliverableSchema.extend({ projectId: z.string().min(1) }))
    .handler(async ({ context, input: { projectId, ...values } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      // Only projects of the caller's workspace; other ids read as missing.
      const [owner] = await context.db
        .select({ id: project.id })
        .from(project)
        .where(
          and(eq(project.id, projectId), eq(project.workspaceId, workspace.id))
        );
      if (!owner) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }
      const [last] = await context.db
        .select({ position: max(deliverable.position) })
        .from(deliverable)
        .where(eq(deliverable.projectId, owner.id));
      const [row] = await context.db
        .insert(deliverable)
        .values({
          ...values,
          position: (last?.position ?? -1) + 1,
          projectId: owner.id,
        })
        .returning();
      if (!row) {
        throw new Error("Deliverable insert returned no row");
      }
      return toDeliverable(row);
    }),
};
