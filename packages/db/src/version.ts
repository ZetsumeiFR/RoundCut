// Version lifecycle (VER-01). Client-safe: no drizzle import.
// A version is "uploading" from the moment its upload is created until the
// object is confirmed in storage; approval (APPR-01) freezes it.
export const VERSION_STATUSES = ["uploading", "ready", "approved"] as const;

export type VersionStatus = (typeof VERSION_STATUSES)[number];

// Whether the client may download a version's file (VER-07), chosen per
// version by the editor: never, as soon as it is published, or only once the
// decider has approved it (APPR-01).
export const CLIENT_DOWNLOAD_POLICIES = [
  "off",
  "allowed",
  "after_approval",
] as const;

export type ClientDownloadPolicy = (typeof CLIENT_DOWNLOAD_POLICIES)[number];

export const clientCanDownload = (
  policy: ClientDownloadPolicy,
  status: VersionStatus
) => {
  if (status === "uploading" || policy === "off") {
    return false;
  }
  return policy === "allowed" || status === "approved";
};
