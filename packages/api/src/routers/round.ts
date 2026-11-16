import { ROUND_TRANSITIONS, type RoundEvent } from "@roundcut/db/round";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { asc, desc, eq, inArray } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { findOwnedProject } from "./review-link";

// The update moving a round through one transition of its state machine:
// the values to set and the guard on its current status, so a round already
// moved by a concurrent request is left untouched (no row returned).
export function roundTransition(event: RoundEvent, at = new Date()) {
  const transition: (typeof ROUND_TRANSITIONS)[RoundEvent] =
    ROUND_TRANSITIONS[event];
  return {
    guard: inArray(round.status, [...transition.from]),
    set:
      "closedReason" in transition
        ? {
            closedAt: at,
            closedReason: transition.closedReason,
            status: transition.to,
          }
        : { status: transition.to, submittedAt: at },
  };
}

export const roundRouter = {
  // Every round of the project's deliverables with its version and dates,
  // latest first within each deliverable.
  list: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .handler(async ({ context, input: { projectId } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      return await context.db
        .select({
          closedAt: round.closedAt,
          closedReason: round.closedReason,
          deliverable: { id: deliverable.id, title: deliverable.title },
          id: round.id,
          kind: round.kind,
          number: round.number,
          openedAt: round.openedAt,
          status: round.status,
          submittedAt: round.submittedAt,
          version: { id: version.id, number: version.number },
        })
        .from(round)
        .innerJoin(deliverable, eq(round.deliverableId, deliverable.id))
        .innerJoin(version, eq(round.versionId, version.id))
        .where(eq(deliverable.projectId, owned.id))
        .orderBy(asc(deliverable.position), desc(round.number));
    }),
};
