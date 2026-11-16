import { ORPCError } from "@orpc/server";
import { client } from "@roundcut/db/schema/client";
import { project } from "@roundcut/db/schema/project";
import { and, desc, eq, isNull } from "drizzle-orm";

import { protectedProcedure } from "../index";
import { projectSchema } from "../project";
import { getOrCreateWorkspace } from "./workspace";

type ProjectRow = typeof project.$inferSelect;

const toProject = (row: ProjectRow, owner: { id: string; name: string }) => ({
  client: owner,
  createdAt: row.createdAt,
  flatFeeCents: row.flatFeeCents,
  id: row.id,
  name: row.name,
  status: row.status,
  targetDate: row.targetDate,
  termsSnapshot: row.termsSnapshot,
});

export const projectRouter = {
  create: protectedProcedure
    .input(projectSchema)
    .handler(async ({ context, input: { revisionTerms, ...values } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      // Projects only go to active clients of the caller's workspace;
      // anything else is reported as missing so other ids leak nothing.
      const [owner] = await context.db
        .select({
          id: client.id,
          name: client.name,
          revisionTerms: client.revisionTerms,
        })
        .from(client)
        .where(
          and(
            eq(client.id, values.clientId),
            eq(client.workspaceId, workspace.id),
            isNull(client.archivedAt)
          )
        );
      if (!owner) {
        throw new ORPCError("NOT_FOUND", { message: "Client not found" });
      }
      const [row] = await context.db
        .insert(project)
        .values({
          ...values,
          termsSnapshot:
            revisionTerms ?? owner.revisionTerms ?? workspace.revisionTerms,
          workspaceId: workspace.id,
        })
        .returning();
      if (!row) {
        throw new Error("Project insert returned no row");
      }
      return toProject(row, { id: owner.id, name: owner.name });
    }),
  list: protectedProcedure.handler(async ({ context }) => {
    const workspace = await getOrCreateWorkspace(
      context.db,
      context.session.user
    );
    const rows = await context.db
      .select({
        client: { id: client.id, name: client.name },
        project,
      })
      .from(project)
      .innerJoin(client, eq(project.clientId, client.id))
      .where(eq(project.workspaceId, workspace.id))
      .orderBy(desc(project.createdAt));
    return rows.map((row) => toProject(row.project, row.client));
  }),
};
