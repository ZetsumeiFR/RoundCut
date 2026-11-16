import type { Session } from "@roundcut/auth";
import type { Database } from "@roundcut/db";

import type { Storage } from "./storage";

export interface Context {
  db: Database;
  session: Session | null;
  storage: Storage;
}
