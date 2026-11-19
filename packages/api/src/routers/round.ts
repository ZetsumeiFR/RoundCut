import { ORPCError } from "@orpc/server";
import type { Database } from "@roundcut/db";
import {
  canGiftRound,
  MANUAL_CLOSE_REASONS,
  ROUND_CLOSE_NOTE_MAX_LENGTH,
  ROUND_GIFT_NOTE_MAX_LENGTH,
  ROUND_TRANSITIONS,
  type RoundEvent,
  roundPositions,
} from "@roundcut/db/round";
import { billableLine } from "@roundcut/db/schema/billable-line";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { extraRoundOffer } from "@roundcut/db/schema/extra-round-offer";
import { project } from "@roundcut/db/schema/project";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { round } from "@roundcut/db/schema/round";
import { version } from "@roundcut/db/schema/version";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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

// The editor's manual closing (ROUND-03): a reason, and a note shown to the
// client, required when the reason is "other".
const closeRoundSchema = z
  .object({
    note: z.string().trim().max(ROUND_CLOSE_NOTE_MAX_LENGTH),
    reason: z.enum(MANUAL_CLOSE_REASONS),
    roundId: z.string().min(1),
  })
  .refine((value) => value.reason !== "other" || value.note.length > 0, {
    message: "Explain why the round is closed",
    path: ["note"],
  });

// The project a round belongs to, owned by the signed-in editor: other
// workspaces' rounds read as missing.
async function findOwnedRound(
  db: Database,
  owner: { id: string; name: string },
  roundId: string
) {
  const [target] = await db
    .select({ projectId: deliverable.projectId })
    .from(round)
    .innerJoin(deliverable, eq(round.deliverableId, deliverable.id))
    .where(eq(round.id, roundId));
  if (!target) {
    throw new ORPCError("NOT_FOUND", { message: "Round not found" });
  }
  return findOwnedProject(db, owner, target.projectId);
}

export const roundRouter = {
  // The editor closes an open round by hand (ROUND-03, §7.2: open -> closed).
  // A submitted round waits for the next version or the approval instead.
  closeManually: protectedProcedure
    .input(closeRoundSchema)
    .handler(async ({ context, input: { note, reason, roundId } }) => {
      await findOwnedRound(context.db, context.session.user, roundId);
      const closing = roundTransition("closeManually");
      const [saved] = await context.db
        .update(round)
        .set({
          ...closing.set,
          closedNote: note || null,
          manualCloseReason: reason,
        })
        .where(and(eq(round.id, roundId), closing.guard))
        .returning({
          closedAt: round.closedAt,
          closedNote: round.closedNote,
          closedReason: round.closedReason,
          id: round.id,
          manualCloseReason: round.manualCloseReason,
          status: round.status,
        });
      if (!saved) {
        throw new ORPCError("CONFLICT", {
          message: "Only an open round can be closed",
        });
      }
      return saved;
    }),

  // The editor offers an open round beyond the included ones for free
  // (ROUND-06, "commercial gesture"): the round becomes a gift, keeps who
  // gifted it, when and the message to the client, and never creates a
  // billable line.
  giftExtra: protectedProcedure
    .input(
      z.object({
        note: z.string().trim().max(ROUND_GIFT_NOTE_MAX_LENGTH),
        roundId: z.string().min(1),
      })
    )
    .handler(async ({ context, input: { note, roundId } }) => {
      const owned = await findOwnedRound(
        context.db,
        context.session.user,
        roundId
      );
      const [[current], [terms], positions] = await Promise.all([
        context.db
          .select({ kind: round.kind, status: round.status })
          .from(round)
          .where(eq(round.id, roundId)),
        context.db
          .select({ termsSnapshot: project.termsSnapshot })
          .from(project)
          .where(eq(project.id, owned.id)),
        projectRoundPositions(context.db, owned.id),
      ]);
      const giftable =
        current !== undefined &&
        terms !== undefined &&
        canGiftRound(
          { ...current, position: positions.get(roundId) ?? 0 },
          terms.termsSnapshot.includedRounds
        );
      // Guarded on the state just checked, so a round submitted or closed
      // meanwhile is left untouched.
      const [saved] = giftable
        ? await context.db
            .update(round)
            .set({
              giftedAt: new Date(),
              giftedByUserId: context.session.user.id,
              giftNote: note || null,
              kind: "gift",
            })
            .where(
              and(
                eq(round.id, roundId),
                eq(round.status, "open"),
                eq(round.kind, "included")
              )
            )
            .returning({
              giftedAt: round.giftedAt,
              giftNote: round.giftNote,
              id: round.id,
              kind: round.kind,
              status: round.status,
            })
        : [];
      if (!saved) {
        throw new ORPCError("CONFLICT", {
          message: "Only an open round beyond the included ones can be gifted",
        });
      }
      return saved;
    }),

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
          billingCurrency: billableLine.currency,
          billingStatus: billableLine.status,
          billingUnitPriceCents: billableLine.unitPriceCents,
          closedAt: round.closedAt,
          closedNote: round.closedNote,
          closedReason: round.closedReason,
          deciderReminderCount: round.deciderReminderCount,
          deliverable: { id: deliverable.id, title: deliverable.title },
          giftedAt: round.giftedAt,
          giftNote: round.giftNote,
          id: round.id,
          kind: round.kind,
          manualCloseReason: round.manualCloseReason,
          number: round.number,
          openedAt: round.openedAt,
          status: round.status,
          submittedAt: round.submittedAt,
          version: { id: version.id, number: version.number },
        })
        .from(round)
        .innerJoin(deliverable, eq(round.deliverableId, deliverable.id))
        .innerJoin(version, eq(round.versionId, version.id))
        // The billable line of the agreement that granted an extra round
        // (EXTRA-05); none when the client paid it online or it was gifted.
        .leftJoin(extraRoundOffer, eq(extraRoundOffer.roundId, round.id))
        .leftJoin(consentRecord, eq(consentRecord.offerId, extraRoundOffer.id))
        .leftJoin(
          billableLine,
          eq(billableLine.consentRecordId, consentRecord.id)
        )
        .where(eq(deliverable.projectId, owned.id))
        .orderBy(asc(deliverable.position), desc(round.number));
      const positions = await projectRoundPositions(context.db, owned.id);
      // Extra rounds the decider declined on a round, with the message they
      // then wrote to the editor (EXTRA-06).
      const declines =
        rounds.length > 0
          ? await context.db
              .select({
                contactedAt: extraRoundOffer.contactedAt,
                contactMessage: extraRoundOffer.contactMessage,
                declinedAt: extraRoundOffer.declinedAt,
                declinedByName: reviewer.name,
                roundId: extraRoundOffer.declinedRoundId,
              })
              .from(extraRoundOffer)
              .leftJoin(
                reviewer,
                eq(extraRoundOffer.declinedByReviewerId, reviewer.id)
              )
              .where(
                and(
                  eq(extraRoundOffer.status, "declined"),
                  inArray(
                    extraRoundOffer.declinedRoundId,
                    rounds.map((item) => item.id)
                  )
                )
              )
          : [];
      const declinedOn = new Map(
        declines.map(({ roundId, ...decline }) => [roundId, decline])
      );
      return rounds.map(
        ({
          billingCurrency,
          billingStatus,
          billingUnitPriceCents,
          ...item
        }) => ({
          ...item,
          billing:
            billingStatus && billingCurrency && billingUnitPriceCents !== null
              ? {
                  currency: billingCurrency,
                  status: billingStatus,
                  unitPriceCents: billingUnitPriceCents,
                }
              : null,
          declinedExtra: declinedOn.get(item.id) ?? null,
          position: positions.get(item.id) ?? item.number,
        })
      );
    }),
};
