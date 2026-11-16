import type { Session } from "@roundcut/auth";
import type { Database } from "@roundcut/db";

import type { ReviewerCookies } from "./reviewer";
import type { Storage } from "./storage";

export interface Context {
  db: Database;
  // Headers merged into the response by oRPC's ResponseHeadersPlugin.
  resHeaders?: Headers;
  reviewerCookies: ReviewerCookies;
  session: Session | null;
  storage: Storage;
}
