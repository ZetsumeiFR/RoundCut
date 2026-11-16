// Project lifecycle (PRJ-03). Every project starts as a draft.
export const PROJECT_STATUSES = [
  "draft",
  "in_progress",
  "awaiting_client",
  "approved",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Statuses a project may move to from each status. Work goes back to
// "in progress" when the client asks for changes; any live project can be
// archived, and an archived project is final.
export const PROJECT_STATUS_TRANSITIONS: Record<
  ProjectStatus,
  readonly ProjectStatus[]
> = {
  approved: ["archived"],
  archived: [],
  awaiting_client: ["in_progress", "approved", "archived"],
  draft: ["in_progress", "archived"],
  in_progress: ["awaiting_client", "archived"],
};

// Statuses from which a project may move to `status`.
export const projectStatusSources = (status: ProjectStatus) =>
  PROJECT_STATUSES.filter((from) =>
    PROJECT_STATUS_TRANSITIONS[from].includes(status)
  );
