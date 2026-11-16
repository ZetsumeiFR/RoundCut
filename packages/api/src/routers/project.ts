import { ORPCError } from "@orpc/server";
import { client } from "@roundcut/db/schema/client";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { protectedProcedure } from "../index";
import { projectSchema } from "../project";
import { toDeliverable } from "./deliverable";
import { getOrCreateWorkspace } from "./workspace";

type ProjectRow = typeof project.$inferSelect;
type Deliverable = ReturnType<typeof toDeliverable>;

const toProject = (
  row: ProjectRow,
  owner: { id: string; name: string },
  deliverables: Deliverable[]
) => ({
  client: owner,
  createdAt: row.createdAt,
  deliverables,
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
    .handler(
      async ({
        context,
        input: { deliverables, revisionTerms, ...values },
      }) => {
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
        return await context.db.transaction(async (tx) => {
          const [row] = await tx
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
          const created =
            deliverables.length > 0
              ? await tx
                  .insert(deliverable)
                  .values(
                    deliverables.map((item, position) => ({
                      ...item,
                      position,
                      projectId: row.id,
                    }))
                  )
                  .returning()
              : [];
          return toProject(
            row,
            { id: owner.id, name: owner.name },
            created.sort((a, b) => a.position - b.position).map(toDeliverable)
          );
        });
      }
    ),
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
    const deliverables =
      rows.length > 0
        ? await context.db
            .select()
            .from(deliverable)
            .where(
              inArray(
                deliverable.projectId,
                rows.map((row) => row.project.id)
              )
            )
            .orderBy(asc(deliverable.position))
        : [];
    const byProject = Map.groupBy(deliverables, (item) => item.projectId);
    return rows.map((row) =>
      toProject(
        row.project,
        row.client,
        (byProject.get(row.project.id) ?? []).map(toDeliverable)
      )
    );
  }),
};
