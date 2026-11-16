import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { clientRouter } from "./client";
import { projectRouter } from "./project";
import { teamRouter } from "./team";
import { workspaceRouter } from "./workspace";

export const appRouter = {
  client: clientRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  project: projectRouter,
  team: teamRouter,
  workspace: workspaceRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
