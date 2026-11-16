import { createRouterClient } from "@orpc/server";
import { appRouter } from "@roundcut/api/routers/index";
import type { Session } from "@roundcut/auth";

import { db, storage } from "@/services";

export const createServerApi = (session: Session) =>
  createRouterClient(appRouter, { context: { db, session, storage } });
