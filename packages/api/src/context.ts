import type { Session } from "@roundcut/auth";
import type { EmailConfig } from "@roundcut/auth/email";
import type { Database } from "@roundcut/db";

import type { ReviewerCookies } from "./reviewer";
import type { Storage } from "./storage";

// What procedures need to email the editor: the mail settings and the app's
// public URL for the links in the message.
export interface Notifications {
  appUrl: string;
  email: EmailConfig;
}

export interface Context {
  db: Database;
  notifications: Notifications;
  // Headers merged into the response by oRPC's ResponseHeadersPlugin.
  resHeaders?: Headers;
  reviewerCookies: ReviewerCookies;
  session: Session | null;
  storage: Storage;
}
