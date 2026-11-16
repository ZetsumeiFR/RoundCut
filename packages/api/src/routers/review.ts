import { ORPCError } from "@orpc/server";
import { client } from "@roundcut/db/schema/client";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, asc, eq, ne } from "drizzle-orm";

import {
  publicProcedure,
  requireReviewLink,
  reviewerProcedure,
} from "../index";
import { reviewTokenSchema } from "../review-link";
import { isAllowedReviewer, reviewerIdentitySchema } from "../reviewer";
import type { FrameRate } from "../timecode";
import { thumbnailUrl } from "./version";

export const reviewRouter = {
  // Clears the identity cookie so someone else can identify on this device.
  forgetIdentity: reviewerProcedure.handler(({ context }) => {
    context.reviewerCookies.clear(context.reviewLink.projectId);
  }),

  // First visit (REV-02): the reviewer gives a name and an email, which must
  // be on the client's whitelist when one is set. The identity is remembered
  // per project for 30 days by a signed cookie.
  identify: publicProcedure
    .input(reviewerIdentitySchema.extend({ token: reviewTokenSchema }))
    .use(requireReviewLink)
    .handler(async ({ context, input: { email, name } }) => {
      const { projectId } = context.reviewLink;
      if (!isAllowedReviewer(context.reviewerClient, email)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Email not allowed on this review link",
        });
      }
      const isDecider =
        email === context.reviewerClient.deciderEmail.toLowerCase();
      const [saved] = await context.db
        .insert(reviewer)
        .values({ email, isDecider, name, projectId })
        .onConflictDoUpdate({
          set: { isDecider, name },
          target: [reviewer.projectId, reviewer.email],
        })
        .returning({
          email: reviewer.email,
          id: reviewer.id,
          isDecider: reviewer.isDecider,
          name: reviewer.name,
        });
      if (!saved) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
      context.reviewerCookies.set(projectId, saved.id);
      return saved;
    }),

  // What the client sees through the link: the project's deliverables and,
  // for each, its latest published version with a short-lived playback URL
  // (signed again on every call). Nothing outside the linked project, and
  // only the project header until the reviewer has identified.
  resolveLink: reviewerProcedure.handler(async ({ context }) => {
    const { expiresAt, projectId } = context.reviewLink;
    const [row] = await context.db
      .select({
        clientName: client.name,
        name: project.name,
        workspaceName: workspace.name,
      })
      .from(project)
      .innerJoin(client, eq(project.clientId, client.id))
      .innerJoin(workspace, eq(project.workspaceId, workspace.id))
      .where(eq(project.id, projectId));
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Review link not found" });
    }
    const header = {
      clientName: row.clientName,
      expiresAt,
      name: row.name,
      workspaceName: row.workspaceName,
    };
    if (!context.reviewer) {
      return { ...header, reviewer: null };
    }
    const deliverables = await context.db
      .select({
        aspect: deliverable.aspect,
        id: deliverable.id,
        title: deliverable.title,
      })
      .from(deliverable)
      .where(eq(deliverable.projectId, projectId))
      .orderBy(asc(deliverable.position));
    const published = await context.db
      .select({ deliverableId: version.deliverableId, version })
      .from(version)
      .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
      .where(
        and(
          eq(deliverable.projectId, projectId),
          ne(version.status, "uploading")
        )
      )
      .orderBy(asc(version.number));
    // Ascending order: the last version seen per deliverable is its latest.
    const latest = new Map(
      published.map((item) => [item.deliverableId, item.version])
    );
    return {
      ...header,
      deliverables: await Promise.all(
        deliverables.map(async (item) => {
          const current = latest.get(item.id);
          return {
            ...item,
            latestVersion: current
              ? {
                  durationMs: current.durationMs,
                  frameRate: current.fps as FrameRate | null,
                  id: current.id,
                  number: current.number,
                  playbackUrl: await context.storage.signGet(current.r2Key),
                  thumbnailUrl: await thumbnailUrl(
                    context.storage,
                    current.thumbnailKey
                  ),
                }
              : null,
          };
        })
      ),
      reviewer: context.reviewer,
    };
  }),
};
