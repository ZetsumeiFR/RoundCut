// Deliverable formats and lifecycle (PRJ-02). Client-safe: no drizzle import.
export const DELIVERABLE_ASPECTS = ["16:9", "9:16", "1:1"] as const;

export type DeliverableAspect = (typeof DELIVERABLE_ASPECTS)[number];

// Every deliverable starts as a draft; review and approval move it forward.
export const DELIVERABLE_STATUSES = ["draft", "in_review", "approved"] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
