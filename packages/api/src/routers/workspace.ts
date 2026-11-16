import type { Database } from "@roundcut/db";
import { PLAN_MAX_FILE_BYTES } from "@roundcut/db/plan";
import { organization } from "@roundcut/db/schema/auth";
import { workspace } from "@roundcut/db/schema/workspace";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../index";
import {
  onboardingSchema,
  revisionTermsSchema,
  type WorkspaceSettings,
  workspaceSettingsSchema,
} from "../workspace";

const BASIS_POINTS_PER_PERCENT = 100;

type WorkspaceRow = typeof workspace.$inferSelect;

const toWorkspace = (row: WorkspaceRow) => ({
  currency: row.currency,
  defaultVatRate: row.defaultVatRateBps / BASIS_POINTS_PER_PERCENT,
  id: row.id,
  locale: row.locale,
  maxUploadBytes: PLAN_MAX_FILE_BYTES[row.plan],
  name: row.name,
  onboardingCompletedAt: row.onboardingCompletedAt,
  plan: row.plan,
  revisionTerms: row.revisionTerms,
  timezone: row.timezone,
});

const toSettingsColumns = (settings: WorkspaceSettings) => ({
  currency: settings.currency,
  defaultVatRateBps: Math.round(
    settings.defaultVatRate * BASIS_POINTS_PER_PERCENT
  ),
  locale: settings.locale,
  name: settings.name,
  timezone: settings.timezone,
});

async function findWorkspace(db: Database, ownerUserId: string) {
  const [row] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.ownerUserId, ownerUserId));
  return row;
}

export async function getOrCreateWorkspace(
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

async function upsertWorkspace(
  db: Database,
  ownerUserId: string,
  columns: Omit<typeof workspace.$inferInsert, "ownerUserId">
) {
  const [row] = await db
    .insert(workspace)
    .values({ ...columns, ownerUserId })
    .onConflictDoUpdate({ set: columns, target: workspace.ownerUserId })
    .returning();
  if (!row) {
    throw new Error(`Workspace upsert returned no row for user ${ownerUserId}`);
  }
  // The Studio (WS-04) shares the workspace id and shows its name.
  await db
    .update(organization)
    .set({ name: row.name })
    .where(eq(organization.id, row.id));
  return toWorkspace(row);
}

export const workspaceRouter = {
  completeOnboarding: protectedProcedure
    .input(onboardingSchema)
    .handler(({ context, input }) =>
      upsertWorkspace(context.db, context.session.user.id, {
        ...toSettingsColumns(input),
        onboardingCompletedAt: new Date(),
        revisionTerms: input.revisionTerms,
      })
    ),
  get: protectedProcedure.handler(async ({ context }) =>
    toWorkspace(await getOrCreateWorkspace(context.db, context.session.user))
  ),
  update: protectedProcedure
    .input(workspaceSettingsSchema)
    .handler(({ context, input }) =>
      upsertWorkspace(
        context.db,
        context.session.user.id,
        toSettingsColumns(input)
      )
    ),
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
