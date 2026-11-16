import { ORPCError } from "@orpc/server";
import { client } from "@roundcut/db/schema/client";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, asc, eq, ne } from "drizzle-orm";

import { reviewerProcedure } from "../index";
import type { FrameRate } from "../timecode";
import { thumbnailUrl } from "./version";

export const reviewRouter = {
  // What the client sees through the link: the project's deliverables and,
  // for each, its latest published version with a short-lived playback URL
  // (signed again on every call). Nothing outside the linked project.
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
      clientName: row.clientName,
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
      expiresAt,
      name: row.name,
      workspaceName: row.workspaceName,
    };
  }),
};
