import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

// Studio team (WS-04). Client-safe: shared by the auth server, the API and the
// web app. Seats count the owner, members and pending invitations.
export const TEAM_SEATS = 3;

export const TEAM_ROLES = ["owner", "editor", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

// The owner is the account that created the Studio: invitations and role
// changes only hand out the other roles.
export const ASSIGNABLE_ROLES = ["editor", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const isAssignableRole = (role: string): role is AssignableRole =>
  (ASSIGNABLE_ROLES as readonly string[]).includes(role);

const PROJECT_ACTIONS = ["create", "update", "delete"] as const;

// `project` is checked by the project API (PRJ-01): editors work on projects,
// viewers only follow them. Team and billing management stay with the owner.
export const teamAccessControl = createAccessControl({
  ...defaultStatements,
  project: PROJECT_ACTIONS,
});

export const teamRoles = {
  editor: teamAccessControl.newRole({ project: [...PROJECT_ACTIONS] }),
  owner: teamAccessControl.newRole({
    ...ownerAc.statements,
    project: [...PROJECT_ACTIONS],
  }),
  viewer: teamAccessControl.newRole({ project: [] }),
} satisfies Record<TeamRole, unknown>;
