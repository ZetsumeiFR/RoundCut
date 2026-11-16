// Version lifecycle (VER-01). Client-safe: no drizzle import.
// A version is "uploading" from the moment its upload is created until the
// object is confirmed in storage; approval (APPR-01) freezes it.
export const VERSION_STATUSES = ["uploading", "ready", "approved"] as const;

export type VersionStatus = (typeof VERSION_STATUSES)[number];
