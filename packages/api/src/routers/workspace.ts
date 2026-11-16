import type { Database } from "@roundcut/db";
import { workspace } from "@roundcut/db/schema/workspace";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../index";
import { revisionTermsSchema, workspaceSettingsSchema } from "../workspace";

const BASIS_POINTS_PER_PERCENT = 100;

type WorkspaceRow = typeof workspace.$inferSelect;

const toWorkspace = (row: WorkspaceRow) => ({
  currency: row.currency,
  defaultVatRate: row.defaultVatRateBps / BASIS_POINTS_PER_PERCENT,
  id: row.id,
  locale: row.locale,
  name: row.name,
  revisionTerms: row.revisionTerms,
  timezone: row.timezone,
});

async function findWorkspace(db: Database, ownerUserId: string) {
  const [row] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.ownerUserId, ownerUserId));
  return row;
}

async function getOrCreateWorkspace(
  db: Database,
  owner: { id: string; name: string }
) {
  const existing = await findWorkspace(db, owner.id);
  if (existing) {
    return existing;
  }
  await db
    .insert(workspace)
    .values({ name: owner.name, ownerUserId: owner.id })
    .onConflictDoNothing({ target: workspace.ownerUserId });
  const created = await findWorkspace(db, owner.id);
  if (!created) {
    throw new Error(`Workspace creation failed for user ${owner.id}`);
  }
  return created;
}

export const workspaceRouter = {
  get: protectedProcedure.handler(async ({ context }) =>
    toWorkspace(await getOrCreateWorkspace(context.db, context.session.user))
  ),
  update: protectedProcedure
    .input(workspaceSettingsSchema)
    .handler(async ({ context, input }) => {
      const settings = {
        currency: input.currency,
        defaultVatRateBps: Math.round(
          input.defaultVatRate * BASIS_POINTS_PER_PERCENT
        ),
        locale: input.locale,
        name: input.name,
        timezone: input.timezone,
      };
      const [row] = await context.db
        .insert(workspace)
        .values({ ...settings, ownerUserId: context.session.user.id })
        .onConflictDoUpdate({ set: settings, target: workspace.ownerUserId })
        .returning();
      if (!row) {
        throw new Error("Workspace update returned no row");
      }
      return toWorkspace(row);
    }),
  updateTerms: protectedProcedure
    .input(revisionTermsSchema)
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .insert(workspace)
        .values({
          name: context.session.user.name,
          ownerUserId: context.session.user.id,
          revisionTerms: input,
        })
        .onConflictDoUpdate({
          set: { revisionTerms: input },
          target: workspace.ownerUserId,
        })
        .returning();
      if (!row) {
        throw new Error("Workspace terms update returned no row");
      }
      return toWorkspace(row);
    }),
};
