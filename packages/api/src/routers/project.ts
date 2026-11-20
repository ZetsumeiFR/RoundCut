import { ORPCError } from "@orpc/server";
import { projectStatusSources } from "@roundcut/db/project-status";
import type { RoundStatus } from "@roundcut/db/round";
import { billableLine } from "@roundcut/db/schema/billable-line";
import { client } from "@roundcut/db/schema/client";
import { comment } from "@roundcut/db/schema/comment";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import type { VersionStatus } from "@roundcut/db/version";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import {
  projectDuplicateSchema,
  projectSchema,
  projectStatusSchema,
} from "../project";
import { insertFlatFeeLine } from "./billing";
import { toDeliverable } from "./deliverable";
import { projectRoundPositions } from "./round";
import { thumbnailUrl } from "./version";
import { getOrCreateWorkspace } from "./workspace";

type ProjectRow = typeof project.$inferSelect;
type Deliverable = ReturnType<typeof toDeliverable>;

export interface ReviewActivity {
  // Latest round, opened when its version was published (VER-04), with its
  // place in the "round n of included" counter (ROUND-02).
  currentRound: {
    number: number;
    position: number;
    status: RoundStatus;
  } | null;
  latestVersion: {
    id: string;
    number: number;
    status: VersionStatus;
    thumbnailUrl: string | null;
  } | null;
  // Top-level comments of the latest version still to process (REV-04).
  openComments: number;
}

export interface DashboardIndicators {
  // Amount still to invoice, excluding VAT: flat fees, extra rounds and
  // manual fees not exported yet (BILL-01).
  billableCents: number;
  extraRoundsThisMonth: number;
  openRounds: number;
  submittedBatches: number;
}

// Rounds, comment batches and extra rounds aren't counted yet (#118): until
// then, the dashboard reads as having nothing to process.
const NO_DASHBOARD_ACTIVITY: Omit<DashboardIndicators, "billableCents"> = {
  extraRoundsThisMonth: 0,
  openRounds: 0,
  submittedBatches: 0,
};

const toProject = <D extends Deliverable>(
  row: ProjectRow,
  owner: { id: string; name: string },
  deliverables: D[]
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
          await insertFlatFeeLine(tx, row, workspace);
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
  duplicate: protectedProcedure
    .input(projectDuplicateSchema)
    .handler(async ({ context, input: { copyDeliverables, id, name } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const [source] = await context.db
        .select({
          client: {
            archivedAt: client.archivedAt,
            id: client.id,
            name: client.name,
          },
          project,
        })
        .from(project)
        .innerJoin(client, eq(project.clientId, client.id))
        .where(and(eq(project.id, id), eq(project.workspaceId, workspace.id)));
      // Other workspaces' projects read as missing so their ids leak nothing.
      if (!source) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }
      // Like creation, new projects only go to active clients.
      if (source.client.archivedAt) {
        throw new ORPCError("CONFLICT", { message: "Client is archived" });
      }
      const owner = { id: source.client.id, name: source.client.name };
      return await context.db.transaction(async (tx) => {
        // The copy starts over: draft status, no target date, and the plan
        // terms agreed on the source rather than the client's current ones.
        const [row] = await tx
          .insert(project)
          .values({
            clientId: owner.id,
            flatFeeCents: source.project.flatFeeCents,
            name,
            termsSnapshot: source.project.termsSnapshot,
            workspaceId: workspace.id,
          })
          .returning();
        if (!row) {
          throw new Error("Project insert returned no row");
        }
        await insertFlatFeeLine(tx, row, workspace);
        const items = copyDeliverables
          ? await tx
              .select({
                aspect: deliverable.aspect,
                position: deliverable.position,
                targetDurationSeconds: deliverable.targetDurationSeconds,
                title: deliverable.title,
              })
              .from(deliverable)
              .where(eq(deliverable.projectId, source.project.id))
          : [];
        const created =
          items.length > 0
            ? await tx
                .insert(deliverable)
                .values(items.map((item) => ({ ...item, projectId: row.id })))
                .returning()
            : [];
        return toProject(
          row,
          owner,
          created.sort((a, b) => a.position - b.position).map(toDeliverable)
        );
      });
    }),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input: { id } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const [row] = await context.db
        .select({
          client: { id: client.id, name: client.name },
          project,
        })
        .from(project)
        .innerJoin(client, eq(project.clientId, client.id))
        .where(and(eq(project.id, id), eq(project.workspaceId, workspace.id)));
      // Other workspaces' projects read as missing so their ids leak nothing.
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }
      const deliverables = await context.db
        .select()
        .from(deliverable)
        .where(eq(deliverable.projectId, row.project.id))
        .orderBy(asc(deliverable.position));
      // Latest version whose upload finished, per deliverable.
      const published = await context.db
        .select({
          deliverableId: version.deliverableId,
          id: version.id,
          number: version.number,
          status: version.status,
          thumbnailKey: version.thumbnailKey,
        })
        .from(version)
        .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
        .where(
          and(
            eq(deliverable.projectId, row.project.id),
            ne(version.status, "uploading")
          )
        )
        .orderBy(asc(version.number));
      // Ascending order: the last version seen per deliverable is its latest.
      const latest = new Map(
        published.map(({ deliverableId, ...item }) => [deliverableId, item])
      );
      const latestVersions = new Map(
        await Promise.all(
          [...latest].map(
            async ([deliverableId, { thumbnailKey, ...item }]) =>
              [
                deliverableId,
                {
                  ...item,
                  thumbnailUrl: await thumbnailUrl(
                    context.storage,
                    thumbnailKey
                  ),
                },
              ] as const
          )
        )
      );
      const latestIds = [...latest.values()].map((item) => item.id);
      const openComments =
        latestIds.length > 0
          ? await context.db
              .select({ count: count(), versionId: comment.versionId })
              .from(comment)
              .where(
                and(
                  inArray(comment.versionId, latestIds),
                  isNull(comment.parentId),
                  eq(comment.status, "open")
                )
              )
              .groupBy(comment.versionId)
          : [];
      const openCounts = new Map(
        openComments.map((item) => [item.versionId, item.count])
      );
      const rounds = await context.db
        .select({
          deliverableId: round.deliverableId,
          id: round.id,
          number: round.number,
          status: round.status,
        })
        .from(round)
        .innerJoin(deliverable, eq(round.deliverableId, deliverable.id))
        .where(eq(deliverable.projectId, row.project.id))
        .orderBy(asc(round.number));
      // Ascending order: the last round seen per deliverable is its latest.
      const positions = await projectRoundPositions(context.db, row.project.id);
      const currentRounds = new Map(
        rounds.map(({ deliverableId, id: roundId, ...current }) => [
          deliverableId,
          { ...current, position: positions.get(roundId) ?? current.number },
        ])
      );
      return toProject(
        row.project,
        row.client,
        deliverables.map((item): Deliverable & { review: ReviewActivity } => ({
          ...toDeliverable(item),
          review: {
            currentRound: currentRounds.get(item.id) ?? null,
            latestVersion: latestVersions.get(item.id) ?? null,
            openComments:
              openCounts.get(latestVersions.get(item.id)?.id ?? "") ?? 0,
          },
        }))
      );
    }),
  indicators: protectedProcedure.handler(
    async ({ context }): Promise<DashboardIndicators> => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const [billable] = await context.db
        .select({
          cents: sql<string>`coalesce(sum(${billableLine.quantity} * ${billableLine.unitPriceCents}), 0)`,
        })
        .from(billableLine)
        .where(
          and(
            eq(billableLine.workspaceId, workspace.id),
            eq(billableLine.status, "to_invoice")
          )
        );
      return {
        ...NO_DASHBOARD_ACTIVITY,
        billableCents: Number(billable?.cents ?? 0),
      };
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
  updateStatus: protectedProcedure
    .input(projectStatusSchema)
    .handler(async ({ context, input: { id, status } }) => {
      const workspace = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const ownProject = and(
        eq(project.id, id),
        eq(project.workspaceId, workspace.id)
      );
      // The allowed source statuses are part of the update itself, so two
      // concurrent changes can never skip a step of the lifecycle.
      const sources = projectStatusSources(status);
      const [updated] =
        sources.length > 0
          ? await context.db
              .update(project)
              .set({ status })
              .where(and(ownProject, inArray(project.status, sources)))
              .returning({ id: project.id, status: project.status })
          : [];
      if (updated) {
        return updated;
      }
      // Other workspaces' projects read as missing so their ids leak nothing.
      const [current] = await context.db
        .select({ status: project.status })
        .from(project)
        .where(ownProject);
      if (!current) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }
      throw new ORPCError("CONFLICT", {
        message: `Cannot move a project from ${current.status} to ${status}`,
      });
    }),
};
