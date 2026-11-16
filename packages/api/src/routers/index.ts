import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { clientRouter } from "./client";
import { commentRouter } from "./comment";
import { deliverableRouter } from "./deliverable";
import { projectRouter } from "./project";
import { reviewRouter } from "./review";
import { reviewLinkRouter } from "./review-link";
import { teamRouter } from "./team";
import { uploadRouter } from "./upload";
import { versionRouter } from "./version";
import { workspaceRouter } from "./workspace";

export const appRouter = {
  client: clientRouter,
  comment: commentRouter,
  deliverable: deliverableRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  project: projectRouter,
  review: reviewRouter,
  reviewLink: reviewLinkRouter,
  team: teamRouter,
  upload: uploadRouter,
  version: versionRouter,
  workspace: workspaceRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
