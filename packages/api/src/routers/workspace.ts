import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import {
  hasWhiteLabel,
  PLAN_LIMITS,
  type PlanState,
  workspacePlan,
} from "@roundcut/db/plan";
import { organization } from "@roundcut/db/schema/auth";
import { workspace } from "@roundcut/db/schema/workspace";
import { eq } from "drizzle-orm";

import { COMMENT_ATTACHMENT_TYPES } from "../comment";
import { protectedProcedure } from "../index";
import type { Storage } from "../storage";
import {
  BRAND_LOGO_MAX_BYTES,
  brandingSchema,
  brandLogoUploadSchema,
  deciderRemindersSchema,
  onboardingSchema,
  reviewerRemindersSchema,
  revisionTermsSchema,
  type WorkspaceSettings,
  workspaceSettingsSchema,
} from "../workspace";
import { checkStoredImage } from "./comment";

const BASIS_POINTS_PER_PERCENT = 100;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LOGO_EXTENSIONS = Object.values(COMMENT_ATTACHMENT_TYPES).join("|");

// Logos live under their workspace so a key can't be borrowed from another.
const logoPrefix = (workspaceId: string) => `brand/${workspaceId}/`;

const isLogoKeyOf = (workspaceId: string, key: string) =>
  new RegExp(`^${logoPrefix(workspaceId)}${UUID}\\.(${LOGO_EXTENSIONS})$`).test(
    key
  );

type WorkspaceRow = typeof workspace.$inferSelect;

// The white label shown on review links (REV-10): nothing on plans without
// it, even when a logo or color was saved on a higher plan.
export async function brandOf(
  storage: Storage,
  row: Pick<WorkspaceRow, "brandAccentColor" | "brandLogoKey"> & PlanState
) {
  if (!hasWhiteLabel(workspacePlan(row))) {
    return null;
  }
  return {
    accentColor: row.brandAccentColor,
    logoUrl: row.brandLogoKey ? await storage.signGet(row.brandLogoKey) : null,
  };
}

const toWorkspace = async (row: WorkspaceRow, storage: Storage) => {
  const plan = workspacePlan(row);
  return {
    branding: {
      accentColor: row.brandAccentColor,
      logoKey: row.brandLogoKey,
      logoUrl: row.brandLogoKey
        ? await storage.signGet(row.brandLogoKey)
        : null,
    },
    currency: row.currency,
    deciderReminders: {
      delayDays: row.deciderReminderDays,
      enabled: row.deciderReminderEnabled,
    },
    defaultVatRate: row.defaultVatRateBps / BASIS_POINTS_PER_PERCENT,
    id: row.id,
    locale: row.locale,
    maxUploadBytes: PLAN_LIMITS[plan].maxFileBytes,
    name: row.name,
    onboardingCompletedAt: row.onboardingCompletedAt,
    plan,
    reviewerReminders: {
      delayHours: row.reviewerReminderHours,
      enabled: row.reviewerReminderEnabled,
    },
    revisionTerms: row.revisionTerms,
    timezone: row.timezone,
    whiteLabel: hasWhiteLabel(plan),
  };
};

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
  return row;
}

// White label is a Pro and Studio feature (REV-10).
const requireWhiteLabel = (row: WorkspaceRow) => {
  if (!hasWhiteLabel(workspacePlan(row))) {
    throw new ORPCError("FORBIDDEN", {
      message: "White label requires the Pro or Studio plan",
    });
  }
};

export const workspaceRouter = {
  completeOnboarding: protectedProcedure
    .input(onboardingSchema)
    .handler(async ({ context, input }) =>
      toWorkspace(
        await upsertWorkspace(context.db, context.session.user.id, {
          ...toSettingsColumns(input),
          onboardingCompletedAt: new Date(),
          revisionTerms: input.revisionTerms,
        }),
        context.storage
      )
    ),
  get: protectedProcedure.handler(async ({ context }) =>
    toWorkspace(
      await getOrCreateWorkspace(context.db, context.session.user),
      context.storage
    )
  ),
  // Where the owner's browser uploads a logo before saving the branding.
  signLogo: protectedProcedure
    .input(brandLogoUploadSchema)
    .handler(async ({ context, input: { contentType } }) => {
      const row = await getOrCreateWorkspace(context.db, context.session.user);
      requireWhiteLabel(row);
      const key = `${logoPrefix(row.id)}${crypto.randomUUID()}.${COMMENT_ATTACHMENT_TYPES[contentType]}`;
      return { key, url: await context.storage.signPut(key, contentType) };
    }),
  update: protectedProcedure
    .input(workspaceSettingsSchema)
    .handler(async ({ context, input }) =>
      toWorkspace(
        await upsertWorkspace(
          context.db,
          context.session.user.id,
          toSettingsColumns(input)
        ),
        context.storage
      )
    ),
  // Saves the logo and accent color of the review links (REV-10). A new
  // logo must be an image uploaded under this workspace; the replaced one
  // is deleted from storage.
  updateBranding: protectedProcedure
    .input(brandingSchema)
    .handler(async ({ context, input }) => {
      const current = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      requireWhiteLabel(current);
      const logoChanged = input.logoKey !== current.brandLogoKey;
      if (input.logoKey && logoChanged) {
        if (!isLogoKeyOf(current.id, input.logoKey)) {
          throw new ORPCError("BAD_REQUEST", { message: "Unknown logo" });
        }
        await checkStoredImage(context.storage, input.logoKey, {
          label: "Logo",
          maxBytes: BRAND_LOGO_MAX_BYTES,
        });
      }
      const [row] = await context.db
        .update(workspace)
        .set({
          brandAccentColor: input.accentColor,
          brandLogoKey: input.logoKey,
        })
        .where(eq(workspace.id, current.id))
        .returning();
      if (!row) {
        throw new Error("Workspace branding update returned no row");
      }
      if (logoChanged && current.brandLogoKey) {
        await context.storage.deleteObject(current.brandLogoKey);
      }
      return toWorkspace(row, context.storage);
    }),
  // Turns the "version awaiting your feedback" reminder to deciders on or
  // off and sets its delay (ROUND-05).
  updateDeciderReminders: protectedProcedure
    .input(deciderRemindersSchema)
    .handler(async ({ context, input }) => {
      const current = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const [row] = await context.db
        .update(workspace)
        .set({
          deciderReminderDays: input.delayDays,
          deciderReminderEnabled: input.enabled,
        })
        .where(eq(workspace.id, current.id))
        .returning();
      if (!row) {
        throw new Error("Workspace reminders update returned no row");
      }
      return toWorkspace(row, context.storage);
    }),
  // Turns the "unsubmitted feedback" reminder on or off and sets its delay
  // (ROUND-04).
  updateReminders: protectedProcedure
    .input(reviewerRemindersSchema)
    .handler(async ({ context, input }) => {
      const current = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      const [row] = await context.db
        .update(workspace)
        .set({
          reviewerReminderEnabled: input.enabled,
          reviewerReminderHours: input.delayHours,
        })
        .where(eq(workspace.id, current.id))
        .returning();
      if (!row) {
        throw new Error("Workspace reminders update returned no row");
      }
      return toWorkspace(row, context.storage);
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
      return toWorkspace(row, context.storage);
    }),
};
