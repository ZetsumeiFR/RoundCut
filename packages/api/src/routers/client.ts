import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import { client } from "@roundcut/db/schema/client";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { clientIdSchema, clientSchema, clientUpdateSchema } from "../client";
import { protectedProcedure } from "../index";
import { getOrCreateWorkspace } from "./workspace";

type ClientRow = typeof client.$inferSelect;

const toClient = (row: ClientRow) => ({
  address: row.address,
  createdAt: row.createdAt,
  deciderEmail: row.deciderEmail,
  deciderName: row.deciderName,
  id: row.id,
  name: row.name,
  notes: row.notes,
  reviewerEmails: row.reviewerEmails,
  siren: row.siren,
  updatedAt: row.updatedAt,
});

async function workspaceIdOf(
  db: Database,
  owner: { id: string; name: string }
) {
  const workspace = await getOrCreateWorkspace(db, owner);
  return workspace.id;
}

// Only active clients of the caller's workspace are reachable; anything else
// is reported as missing so ids of other workspaces leak nothing.
const activeClient = (workspaceId: string, id: string) =>
  and(
    eq(client.id, id),
    eq(client.workspaceId, workspaceId),
    isNull(client.archivedAt)
  );

const notFound = () =>
  new ORPCError("NOT_FOUND", { message: "Client not found" });

const found = (row: ClientRow | undefined) => {
  if (!row) {
    throw notFound();
  }
  return toClient(row);
};

export const clientRouter = {
  archive: protectedProcedure
    .input(clientIdSchema)
    .handler(async ({ context, input }) => {
      const workspaceId = await workspaceIdOf(context.db, context.session.user);
      const [row] = await context.db
        .update(client)
        .set({ archivedAt: new Date() })
        .where(activeClient(workspaceId, input.id))
        .returning();
      return found(row);
    }),
  create: protectedProcedure
    .input(clientSchema)
    .handler(async ({ context, input }) => {
      const workspaceId = await workspaceIdOf(context.db, context.session.user);
      const [row] = await context.db
        .insert(client)
        .values({ ...input, workspaceId })
        .returning();
      if (!row) {
        throw new Error("Client insert returned no row");
      }
      return toClient(row);
    }),
  get: protectedProcedure
    .input(clientIdSchema)
    .handler(async ({ context, input }) => {
      const workspaceId = await workspaceIdOf(context.db, context.session.user);
      const [row] = await context.db
        .select()
        .from(client)
        .where(activeClient(workspaceId, input.id));
      return found(row);
    }),
  list: protectedProcedure.handler(async ({ context }) => {
    const workspaceId = await workspaceIdOf(context.db, context.session.user);
    const rows = await context.db
      .select()
      .from(client)
      .where(
        and(eq(client.workspaceId, workspaceId), isNull(client.archivedAt))
      )
      .orderBy(asc(sql`lower(${client.name})`), asc(client.createdAt));
    return rows.map(toClient);
  }),
  update: protectedProcedure
    .input(clientUpdateSchema)
    .handler(async ({ context, input: { id, ...values } }) => {
      const workspaceId = await workspaceIdOf(context.db, context.session.user);
      const [row] = await context.db
        .update(client)
        .set(values)
        .where(activeClient(workspaceId, id))
        .returning();
      return found(row);
    }),
};
