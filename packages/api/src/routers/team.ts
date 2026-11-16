import { TEAM_ROLES, TEAM_SEATS, type TeamRole } from "@roundcut/auth/team";
import type { Database } from "@roundcut/db";
import {
  invitation,
  member,
  organization,
  user,
} from "@roundcut/db/schema/auth";
import { and, asc, eq, gt } from "drizzle-orm";

import { protectedProcedure } from "../index";
import { getOrCreateWorkspace } from "./workspace";

const PENDING = "pending";

const toTeamRole = (role: string | null): TeamRole =>
  TEAM_ROLES.find((teamRole) => teamRole === role) ?? "viewer";

// Every account owns one Studio whose id is its workspace id; it is created
// on first use, with the account as its owner.
async function ensureOwnStudio(
  db: Database,
  owner: { id: string; name: string }
) {
  const workspace = await getOrCreateWorkspace(db, owner);
  const createdAt = new Date();
  await db
    .insert(organization)
    .values({
      createdAt,
      id: workspace.id,
      name: workspace.name,
      slug: workspace.id,
    })
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      createdAt,
      id: crypto.randomUUID(),
      organizationId: workspace.id,
      role: "owner",
      userId: owner.id,
    })
    .onConflictDoNothing();
  return workspace.id;
}

function listStudios(db: Database, userId: string) {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
}

function listMembers(db: Database, studioId: string) {
  return db
    .select({
      email: user.email,
      id: member.id,
      image: user.image,
      joinedAt: member.createdAt,
      name: user.name,
      role: member.role,
      userId: member.userId,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, studioId))
    .orderBy(asc(member.createdAt));
}

function listPendingInvitations(db: Database, studioId: string, now: Date) {
  return db
    .select({
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      id: invitation.id,
      role: invitation.role,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, studioId),
        eq(invitation.status, PENDING),
        gt(invitation.expiresAt, now)
      )
    )
    .orderBy(asc(invitation.createdAt));
}

function listReceivedInvitations(db: Database, email: string, now: Date) {
  return db
    .select({
      id: invitation.id,
      inviterName: user.name,
      role: invitation.role,
      studioName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        eq(invitation.status, PENDING),
        gt(invitation.expiresAt, now)
      )
    )
    .orderBy(asc(invitation.createdAt));
}

export const teamRouter = {
  // The Studio shown is the session's active one (set when an invitation is
  // accepted or the account switches Studio), else the account's own.
  get: protectedProcedure.handler(async ({ context }) => {
    const { db, session } = context;
    const now = new Date();
    let studios = await listStudios(db, session.user.id);
    if (!studios.some((studio) => studio.role === "owner")) {
      await ensureOwnStudio(db, session.user);
      studios = await listStudios(db, session.user.id);
    }
    const current =
      studios.find(
        (studio) => studio.id === session.session.activeOrganizationId
      ) ?? studios.find((studio) => studio.role === "owner");
    if (!current) {
      throw new Error(`No Studio found for user ${session.user.id}`);
    }
    const role = toTeamRole(current.role);

    const [members, invitations, received] = await Promise.all([
      listMembers(db, current.id),
      role === "owner" ? listPendingInvitations(db, current.id, now) : [],
      listReceivedInvitations(db, session.user.email, now),
    ]);

    return {
      id: current.id,
      invitations: invitations.map((pending) => ({
        ...pending,
        role: toTeamRole(pending.role),
      })),
      members: members.map((teamMember) => ({
        ...teamMember,
        role: toTeamRole(teamMember.role),
      })),
      name: current.name,
      received: received.map((pending) => ({
        ...pending,
        role: toTeamRole(pending.role),
      })),
      role,
      seats: TEAM_SEATS,
      studios: studios.map((studio) => ({
        ...studio,
        role: toTeamRole(studio.role),
      })),
    };
  }),
};
