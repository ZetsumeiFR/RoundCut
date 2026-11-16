import type { Database } from "@roundcut/db";
import {
  EXTRA_ROUND_OFFER_VALIDITY_DAYS,
  needsExtraRound,
  offerAmounts,
} from "@roundcut/db/extra-round";
import { extraRoundOffer } from "@roundcut/db/schema/extra-round-offer";
import { project } from "@roundcut/db/schema/project";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, eq, lte } from "drizzle-orm";
import z from "zod";

import { publicProcedure, requireReviewLink } from "../index";
import { reviewTokenSchema } from "../review-link";
import { findReviewVersion, requireReviewer } from "./comment";
import { batchSize, findVersionRound, pendingSize } from "./review";
import { projectRoundPositions } from "./round";

const DAY_MS = 24 * 60 * 60 * 1000;

interface OfferTerms {
  currency: string;
  delayDays: number;
  priceCents: number;
  requirePayment: boolean;
  vatRateBps: number;
}

// The deliverable's offer still waiting for an answer, made from the current
// terms when there is none. Offers left unanswered past their validity are
// expired first (§7.3), and a concurrent request proposing the same offer
// loses to the unique index and reads the winner's.
async function proposeOffer(
  db: Database,
  deliverableId: string,
  terms: OfferTerms
) {
  const now = new Date();
  const proposed = and(
    eq(extraRoundOffer.deliverableId, deliverableId),
    eq(extraRoundOffer.status, "proposed")
  );
  await db
    .update(extraRoundOffer)
    .set({ status: "expired" })
    .where(and(proposed, lte(extraRoundOffer.expiresAt, now)));
  await db
    .insert(extraRoundOffer)
    .values({
      ...terms,
      deliverableId,
      expiresAt: new Date(
        now.getTime() + EXTRA_ROUND_OFFER_VALIDITY_DAYS * DAY_MS
      ),
    })
    .onConflictDoNothing();
  const [offer] = await db.select().from(extraRoundOffer).where(proposed);
  return offer ?? null;
}

export const extraRoundRouter = {
  // The extra round offered on a version (EXTRA-01): null until the included
  // rounds are used up and the client has started a new batch, then the
  // offer with its price excluding VAT, VAT, total, delay and payment rule.
  getOffer: publicProcedure
    .input(z.object({ token: reviewTokenSchema, versionId: z.string().min(1) }))
    .use(requireReviewLink)
    .handler(async ({ context, input: { versionId } }) => {
      requireReviewer(context.reviewer);
      const { projectId } = context.reviewLink;
      const target = await findReviewVersion(context.db, projectId, versionId);
      const current = await findVersionRound(context.db, target.id);
      const [owner] = await context.db
        .select({
          currency: workspace.currency,
          termsSnapshot: project.termsSnapshot,
          vatRateBps: workspace.defaultVatRateBps,
        })
        .from(project)
        .innerJoin(workspace, eq(project.workspaceId, workspace.id))
        .where(eq(project.id, projectId));
      if (!(current && owner)) {
        return null;
      }
      const position =
        (await projectRoundPositions(context.db, projectId)).get(current.id) ??
        current.number;
      const terms = owner.termsSnapshot;
      if (!needsExtraRound({ ...current, position }, terms.includedRounds)) {
        return null;
      }
      // Feedback in a round beyond the included ones, or written after the
      // last included round was submitted, is the new batch.
      const opensBatch = current.status === "open";
      const started = opensBatch
        ? (await batchSize(context.db, current.id)) > 0
        : (await pendingSize(context.db, target.id)) > 0;
      if (!started) {
        return null;
      }
      const offer = await proposeOffer(context.db, target.deliverableId, {
        currency: owner.currency,
        delayDays: terms.extraRoundDelayDays,
        priceCents: terms.extraRoundPriceCents,
        requirePayment: terms.requirePayment,
        vatRateBps: owner.vatRateBps,
      });
      if (!offer) {
        return null;
      }
      return {
        ...offerAmounts(offer.priceCents, offer.vatRateBps),
        currency: offer.currency,
        delayDays: offer.delayDays,
        expiresAt: offer.expiresAt,
        id: offer.id,
        requirePayment: offer.requirePayment,
        // The round the agreement would grant: the open one, or the next.
        round: opensBatch ? position : position + 1,
        vatRateBps: offer.vatRateBps,
      };
    }),
};
