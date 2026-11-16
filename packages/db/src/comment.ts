// Timestamped feedback on a version (REV-03, REV-04). Client-safe: no drizzle
// import.
export const COMMENT_AUTHOR_TYPES = ["editor", "reviewer"] as const;

export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];

export const COMMENT_STATUSES = ["open", "done", "rejected"] as const;

export type CommentStatus = (typeof COMMENT_STATUSES)[number];
