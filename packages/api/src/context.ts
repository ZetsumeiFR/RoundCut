import type { Session } from "@roundcut/auth";
import type { Database } from "@roundcut/db";

export type Context = {
  session: Session | null;
  db: Database;
};
