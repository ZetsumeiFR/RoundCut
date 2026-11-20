import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { billingRouter } from "./billing";
import { clientRouter } from "./client";
import { commentRouter } from "./comment";
import { deliverableRouter } from "./deliverable";
import { extraRoundRouter } from "./extra-round";
import { paymentsRouter } from "./payments";
import { projectRouter } from "./project";
import { receiptRouter } from "./receipt";
import { reviewRouter } from "./review";
import { reviewLinkRouter } from "./review-link";
import { roundRouter } from "./round";
import { teamRouter } from "./team";
import { uploadRouter } from "./upload";
import { versionRouter } from "./version";
import { workspaceRouter } from "./workspace";

export const appRouter = {
  billing: billingRouter,
  client: clientRouter,
  comment: commentRouter,
  deliverable: deliverableRouter,
  extraRound: extraRoundRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  payments: paymentsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  project: projectRouter,
  receipt: receiptRouter,
  review: reviewRouter,
  reviewLink: reviewLinkRouter,
  round: roundRouter,
  team: teamRouter,
  upload: uploadRouter,
  version: versionRouter,
  workspace: workspaceRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
