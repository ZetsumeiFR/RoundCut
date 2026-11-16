import { ORPCError } from "@orpc/server";
import { extraRoundForwardEmail, sendEmail } from "@roundcut/auth/email";
import { resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import {
  EXTRA_ROUND_OFFER_VALIDITY_DAYS,
  needsExtraRound,
  offerAmounts,
} from "@roundcut/db/extra-round";
import { client } from "@roundcut/db/schema/client";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { deliverable } from "@roundcut/db/schema/deliverable";
import { extraRoundOffer } from "@roundcut/db/schema/extra-round-offer";
import { project } from "@roundcut/db/schema/project";
import { reviewer } from "@roundcut/db/schema/reviewer";
import { version } from "@roundcut/db/schema/version";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import z from "zod";

import {
  type ConsentShown,
  consentShownSchema,
  snapshotHash,
} from "../consent";
import type { Notifications, RequestOrigin } from "../context";
import { publicProcedure, requireReviewLink } from "../index";
import { reviewTokenSchema } from "../review-link";
import { isDeciderEmail } from "../reviewer";
import { consumeReviewerCode, reviewerCodeSchema } from "../reviewer-code";
import { findReviewVersion, requireDecider, requireReviewer } from "./comment";
import { batchSize, findVersionRound, pendingSize } from "./review";
import { projectRoundPositions } from "./round";

const DAY_MS = 24 * 60 * 60 * 1000;

const FORWARD_INTERVAL_MS = 60 * 60 * 1000;

const offerInput = z.object({
  offerId: z.string().min(1),
  token: reviewTokenSchema,
  versionId: z.string().min(1),
});

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

// An offer the decider accepted (EXTRA-02) that hasn't opened its round yet:
// it stands for the new batch until its payment or opening (EXTRA-04/05).
async function acceptedOffer(db: Database, deliverableId: string) {
  const [offer] = await db
    .select()
    .from(extraRoundOffer)
    .where(
      and(
        eq(extraRoundOffer.deliverableId, deliverableId),
        eq(extraRoundOffer.status, "accepted"),
        isNull(extraRoundOffer.roundId)
      )
    )
    .orderBy(desc(extraRoundOffer.acceptedAt))
    .limit(1);
  return offer ?? null;
}

// The agreement record of an accepted offer (EXTRA-03), as shown on the page.
async function offerConsent(db: Database, offerId: string) {
  const [record] = await db
    .select({
      createdAt: consentRecord.createdAt,
      email: consentRecord.email,
      name: consentRecord.name,
      snapshotHash: consentRecord.snapshotHash,
    })
    .from(consentRecord)
    .where(eq(consentRecord.offerId, offerId));
  return record ?? null;
}

// The extra round offered on a version (EXTRA-01): null until the included
// rounds are used up and the client has started a new batch, then the offer
// with its amounts, delay, payment rule and the decider's answer.
async function currentOffer(
  db: Database,
  projectId: string,
  versionId: string
) {
  const target = await findReviewVersion(db, projectId, versionId);
  const current = await findVersionRound(db, target.id);
  const [owner] = await db
    .select({
      currency: workspace.currency,
      deciderName: client.deciderName,
      termsSnapshot: project.termsSnapshot,
      vatRateBps: workspace.defaultVatRateBps,
    })
    .from(project)
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .innerJoin(client, eq(project.clientId, client.id))
    .where(eq(project.id, projectId));
  if (!(current && owner)) {
    return null;
  }
  const position =
    (await projectRoundPositions(db, projectId)).get(current.id) ??
    current.number;
  const terms = owner.termsSnapshot;
  if (!needsExtraRound({ ...current, position }, terms.includedRounds)) {
    return null;
  }
  // Feedback in a round beyond the included ones, or written after the
  // last included round was submitted, is the new batch.
  const opensBatch = current.status === "open";
  const started = opensBatch
    ? (await batchSize(db, current.id)) > 0
    : (await pendingSize(db, target.id)) > 0;
  if (!started) {
    return null;
  }
  const offer =
    (await acceptedOffer(db, target.deliverableId)) ??
    (await proposeOffer(db, target.deliverableId, {
      currency: owner.currency,
      delayDays: terms.extraRoundDelayDays,
      priceCents: terms.extraRoundPriceCents,
      requirePayment: terms.requirePayment,
      vatRateBps: owner.vatRateBps,
    }));
  if (!offer) {
    return null;
  }
  const [acceptedBy] = offer.acceptedByReviewerId
    ? await db
        .select({ name: reviewer.name })
        .from(reviewer)
        .where(eq(reviewer.id, offer.acceptedByReviewerId))
    : [];
  return {
    ...offerAmounts(offer.priceCents, offer.vatRateBps),
    acceptedAt: offer.acceptedAt,
    acceptedByName: acceptedBy?.name ?? null,
    consent:
      offer.status === "accepted" ? await offerConsent(db, offer.id) : null,
    currency: offer.currency,
    deciderName: owner.deciderName,
    delayDays: offer.delayDays,
    deliverableId: target.deliverableId,
    expiresAt: offer.expiresAt,
    forwardedAt: offer.forwardedAt,
    id: offer.id,
    requirePayment: offer.requirePayment,
    // The round the agreement grants: the open one, or the next.
    round: opensBatch ? position : position + 1,
    status: offer.status,
    vatRateBps: offer.vatRateBps,
  };
}

type Offer = NonNullable<Awaited<ReturnType<typeof currentOffer>>>;

async function openOffer(
  db: Database,
  projectId: string,
  input: { offerId: string; versionId: string }
) {
  const offer = await currentOffer(db, projectId, input.versionId);
  if (offer?.id !== input.offerId || offer.status !== "proposed") {
    throw new ORPCError("CONFLICT", {
      message: "This offer is no longer waiting for an answer",
    });
  }
  return offer;
}

// Emails the client's decider, in the workspace language, that a reviewer
// needs their agreement on the offer, with the review link to accept it.
async function emailDecider(
  db: Database,
  notifications: Notifications,
  offer: Offer,
  forward: { reviewerName: string; token: string }
) {
  const [row] = await db
    .select({
      deciderEmail: client.deciderEmail,
      deciderName: client.deciderName,
      deliverableTitle: deliverable.title,
      locale: workspace.locale,
      projectName: project.name,
      studioName: workspace.name,
    })
    .from(deliverable)
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(client, eq(project.clientId, client.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(eq(deliverable.id, offer.deliverableId));
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Deliverable not found" });
  }
  await sendEmail(
    notifications.email,
    extraRoundForwardEmail(resolveLocale(row.locale), row.deciderEmail, {
      deciderName: row.deciderName,
      deliverableTitle: row.deliverableTitle,
      projectName: row.projectName,
      reviewerName: forward.reviewerName,
      roundNumber: offer.round,
      studioName: row.studioName,
      url: `${notifications.appUrl}/r/${forward.token}`,
    })
  );
}

// Everything the decider agreed to (EXTRA-03): who, when (UTC), from where,
// the offer's terms and amounts, what the project is, and the text shown.
async function agreementSnapshot(
  db: Database,
  agreement: {
    agreedAt: Date;
    offer: Offer;
    request: RequestOrigin;
    shown: ConsentShown;
    signer: { email: string; id: string; name: string };
    versionId: string;
  }
) {
  const { offer, signer } = agreement;
  const [row] = await db
    .select({
      deliverableTitle: deliverable.title,
      projectId: project.id,
      projectName: project.name,
      versionNumber: version.number,
      workspaceName: workspace.name,
    })
    .from(version)
    .innerJoin(deliverable, eq(version.deliverableId, deliverable.id))
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(eq(version.id, agreement.versionId));
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Version not found" });
  }
  return {
    agreedAt: agreement.agreedAt.toISOString(),
    kind: "extra_round",
    offer: {
      currency: offer.currency,
      delayDays: offer.delayDays,
      expiresAt: offer.expiresAt.toISOString(),
      grossCents: offer.grossCents,
      id: offer.id,
      netCents: offer.netCents,
      requirePayment: offer.requirePayment,
      round: offer.round,
      vatCents: offer.vatCents,
      vatRateBps: offer.vatRateBps,
    },
    project: {
      deliverable: { id: offer.deliverableId, title: row.deliverableTitle },
      id: row.projectId,
      name: row.projectName,
      version: { id: agreement.versionId, number: row.versionNumber },
      workspace: row.workspaceName,
    },
    request: {
      ip: agreement.request.ip,
      userAgent: agreement.request.userAgent,
    },
    shown: agreement.shown,
    signer: { email: signer.email, name: signer.name, reviewerId: signer.id },
    snapshotVersion: 1,
  };
}

export const extraRoundRouter = {
  // The decider accepts the offer on screen (EXTRA-02): they tick the
  // agreement and type the code emailed by review.requestOtp. The answer is
  // recorded once, and proves the decider's email. The agreement record
  // (EXTRA-03) is written in the same transaction, with the text shown.
  accept: publicProcedure
    .input(
      offerInput.extend({
        agreed: z.literal(true),
        code: reviewerCodeSchema,
        shown: consentShownSchema,
      })
    )
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const { projectId } = context.reviewLink;
      const offer = await openOffer(context.db, projectId, input);
      await consumeReviewerCode(
        context.db,
        decider.id,
        "extra_round",
        input.code
      );
      const now = new Date();
      const snapshot = await agreementSnapshot(context.db, {
        agreedAt: now,
        offer,
        request: context.request,
        shown: input.shown,
        signer: decider,
        versionId: input.versionId,
      });
      const consent = await context.db.transaction(async (tx) => {
        const [accepted] = await tx
          .update(extraRoundOffer)
          .set({
            acceptedAt: now,
            acceptedByReviewerId: decider.id,
            status: "accepted",
          })
          .where(
            and(
              eq(extraRoundOffer.id, offer.id),
              eq(extraRoundOffer.status, "proposed"),
              gt(extraRoundOffer.expiresAt, now)
            )
          )
          .returning({ id: extraRoundOffer.id });
        if (!accepted) {
          throw new ORPCError("CONFLICT", {
            message: "This offer is no longer waiting for an answer",
          });
        }
        const [record] = await tx
          .insert(consentRecord)
          .values({
            createdAt: now,
            email: decider.email,
            ip: context.request.ip,
            kind: "extra_round",
            name: decider.name,
            offerId: offer.id,
            projectId,
            reviewerId: decider.id,
            snapshot,
            snapshotHash: snapshotHash(snapshot),
            userAgent: context.request.userAgent,
          })
          .returning({
            createdAt: consentRecord.createdAt,
            email: consentRecord.email,
            name: consentRecord.name,
            snapshotHash: consentRecord.snapshotHash,
          });
        await tx
          .update(reviewer)
          .set({ verifiedAt: now })
          .where(eq(reviewer.id, decider.id));
        return record ?? null;
      });
      return {
        ...offer,
        acceptedAt: now,
        acceptedByName: decider.name,
        consent,
        status: "accepted" as const,
      };
    }),

  // A reviewer who isn't the decider can't accept (EXTRA-02): they forward
  // the offer to the decider by email, at most once an hour per offer.
  forward: publicProcedure
    .input(offerInput)
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const sender = requireReviewer(context.reviewer);
      if (isDeciderEmail(context.reviewerClient, sender.email)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The decider accepts the offer directly",
        });
      }
      const { projectId } = context.reviewLink;
      const offer = await openOffer(context.db, projectId, input);
      const now = new Date();
      const [claimed] = await context.db
        .update(extraRoundOffer)
        .set({ forwardedAt: now })
        .where(
          and(
            eq(extraRoundOffer.id, offer.id),
            eq(extraRoundOffer.status, "proposed"),
            or(
              isNull(extraRoundOffer.forwardedAt),
              lte(
                extraRoundOffer.forwardedAt,
                new Date(now.getTime() - FORWARD_INTERVAL_MS)
              )
            )
          )
        )
        .returning({ id: extraRoundOffer.id });
      // Forwarded within the hour: the decider already has the email.
      if (!claimed) {
        return { forwardedAt: offer.forwardedAt ?? now };
      }
      try {
        await emailDecider(context.db, context.notifications, offer, {
          reviewerName: sender.name,
          token: input.token,
        });
      } catch (error) {
        await context.db
          .update(extraRoundOffer)
          .set({ forwardedAt: offer.forwardedAt })
          .where(eq(extraRoundOffer.id, offer.id));
        console.error("Extra round forward email failed", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          cause: error,
          message: "Couldn't email the decider",
        });
      }
      return { forwardedAt: now };
    }),

  getOffer: publicProcedure
    .input(z.object({ token: reviewTokenSchema, versionId: z.string().min(1) }))
    .use(requireReviewLink)
    .handler(async ({ context, input: { versionId } }) => {
      const viewer = requireReviewer(context.reviewer);
      const offer = await currentOffer(
        context.db,
        context.reviewLink.projectId,
        versionId
      );
      return offer
        ? {
            ...offer,
            canAccept: isDeciderEmail(context.reviewerClient, viewer.email),
          }
        : null;
    }),
};
