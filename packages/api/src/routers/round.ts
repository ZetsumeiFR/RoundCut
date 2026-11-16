import type { Database } from "@roundcut/db";
import {
  ROUND_TRANSITIONS,
  type RoundEvent,
  roundPositions,
} from "@roundcut/db/round";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { project } from "@roundcut/db/schema/project";
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

// Where each round of a project stands in the "round n of included" counter
// (ROUND-02), under the scope of the project's revision terms.
export async function projectRoundPositions(db: Database, projectId: string) {
  const [owner] = await db
    .select({ termsSnapshot: project.termsSnapshot })
    .from(project)
    .where(eq(project.id, projectId));
  if (!owner) {
    return new Map<string, number>();
  }
  const rounds = await db
    .select({ id: round.id, number: round.number, openedAt: round.openedAt })
    .from(round)
    .innerJoin(deliverable, eq(round.deliverableId, deliverable.id))
    .where(eq(deliverable.projectId, projectId));
  return roundPositions(rounds, owner.termsSnapshot.scope);
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
      const rounds = await context.db
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
      const positions = await projectRoundPositions(context.db, owned.id);
      return rounds.map((item) => ({
        ...item,
        position: positions.get(item.id) ?? item.number,
      }));
    }),
};
