// Project lifecycle (PRJ-03). Every project starts as a draft.
export const PROJECT_STATUSES = [
  "draft",
  "in_progress",
  "awaiting_client",
  "approved",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
