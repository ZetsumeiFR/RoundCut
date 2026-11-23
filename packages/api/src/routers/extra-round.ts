import { ORPCError } from "@orpc/server";
import {
  extraRoundContactEmail,
  extraRoundForwardEmail,
  extraRoundProposedEmail,
  sendEmail,
} from "@roundcut/auth/email";
import { LOCALES, resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import {
  EXTRA_ROUND_CONTACT_MAX_LENGTH,
  EXTRA_ROUND_OFFER_VALIDITY_DAYS,
  EXTRA_ROUND_SIZES,
  needsExtraRound,
  offerAmounts,
} from "@roundcut/db/extra-round";
import { lightExtraRoundPrice } from "@roundcut/db/revision-terms";
import { user } from "@roundcut/db/schema/auth";
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
import { openAgreedRound } from "../extra-round-payment";
import { publicProcedure, requireReviewLink } from "../index";
import {
  notifyEditor,
  notifyVersionEditor,
  versionEditor,
} from "../notifications";
import {
  canTakeRoundPayments,
  fetchPaymentsActive,
  type StripeClient,
} from "../payments";
import { emailReceipt, findReceipt, receiptFile } from "../receipt";
import { reviewTokenSchema } from "../review-link";
import { isDeciderEmail } from "../reviewer";
import { consumeReviewerCode, reviewerCodeSchema } from "../reviewer-code";
import { extraRoundLabel, insertExtraRoundLine } from "./billing";
import { findReviewVersion, requireDecider, requireReviewer } from "./comment";
import { batchSize, findVersionRound, pendingSize } from "./review";
import { projectRoundPositions } from "./round";

const DAY_MS = 24 * 60 * 60 * 1000;

const FORWARD_INTERVAL_MS = 60 * 60 * 1000;

const CENTS_PER_UNIT = 100;

const offerInput = z.object({
  offerId: z.string().min(1),
  token: reviewTokenSchema,
  versionId: z.string().min(1),
});

interface OfferTerms {
  currency: string;
  delayDays: number;
  lightPriceCents: number | null;
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
  terms: OfferTerms,
  onProposed: (offer: typeof extraRoundOffer.$inferSelect) => Promise<void>
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
  const [created] = await db
    .insert(extraRoundOffer)
    .values({
      ...terms,
      deliverableId,
      expiresAt: new Date(
        now.getTime() + EXTRA_ROUND_OFFER_VALIDITY_DAYS * DAY_MS
      ),
    })
    .onConflictDoNothing()
    .returning();
  if (created) {
    await onProposed(created);
  }
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

// The offer the decider declined on the deliverable's current round
// (EXTRA-06): their answer stands, and no new offer is made, until the next
// version opens a new round.
async function declinedOffer(db: Database, roundId: string) {
  const [offer] = await db
    .select()
    .from(extraRoundOffer)
    .where(
      and(
        eq(extraRoundOffer.declinedRoundId, roundId),
        eq(extraRoundOffer.status, "declined")
      )
    )
    .orderBy(desc(extraRoundOffer.declinedAt))
    .limit(1);
  return offer ?? null;
}

async function reviewerName(db: Database, reviewerId: string | null) {
  if (!reviewerId) {
    return null;
  }
  const [row] = await db
    .select({ name: reviewer.name })
    .from(reviewer)
    .where(eq(reviewer.id, reviewerId));
  return row?.name ?? null;
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

// The reviewer whose request may propose the offer, and how to announce it.
interface Proposer {
  isDecider: boolean;
  notifications: Notifications;
  reviewerName: string;
  token: string;
}

const proposerOf = (
  context: {
    notifications: Notifications;
    reviewerClient: { deciderEmail: string };
  },
  viewer: { email: string; name: string },
  token: string
): Proposer => ({
  isDecider: isDeciderEmail(context.reviewerClient, viewer.email),
  notifications: context.notifications,
  reviewerName: viewer.name,
  token,
});

// The extra round offered on a version (EXTRA-01): null until the included
// rounds are used up and the client has started a new batch, then the offer
// with its amounts, delay, payment rule and the decider's answer.
async function currentOffer(
  db: Database,
  stripe: StripeClient | null,
  projectId: string,
  versionId: string,
  proposer: Proposer
) {
  const target = await findReviewVersion(db, projectId, versionId);
  const current = await findVersionRound(db, target.id);
  const [owner] = await db
    .select({
      currency: workspace.currency,
      deciderName: client.deciderName,
      plan: workspace.plan,
      planStatus: workspace.planStatus,
      stripeAccountId: workspace.stripeAccountId,
      stripePaymentsActive: workspace.stripePaymentsActive,
      termsSnapshot: project.termsSnapshot,
      trialEndsAt: workspace.trialEndsAt,
      vatRateBps: workspace.defaultVatRateBps,
    })
    .from(project)
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .innerJoin(client, eq(project.clientId, client.id))
    .where(eq(project.id, projectId));
  // An approved version takes no more rounds (EXTRA-06).
  if (!(current && owner) || target.status === "approved") {
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
    (await declinedOffer(db, current.id)) ??
    (await proposeOffer(
      db,
      target.deliverableId,
      {
        currency: owner.currency,
        delayDays: terms.extraRoundDelayDays,
        lightPriceCents: lightExtraRoundPrice(terms),
        priceCents: terms.extraRoundPriceCents,
        // Online payment needs the editor's connected Stripe account
        // (EXTRA-04); without it the editor invoices the round.
        requirePayment:
          terms.requirePayment && canTakeRoundPayments(stripe, owner),
        vatRateBps: owner.vatRateBps,
      },
      (created) =>
        announceOffer(db, proposer, {
          offer: created,
          round: opensBatch ? position : position + 1,
          versionId: target.id,
        })
    ));
  if (!offer) {
    return null;
  }
  return {
    ...offerAmounts(offer.priceCents, offer.vatRateBps),
    acceptedAt: offer.acceptedAt,
    acceptedByName: await reviewerName(db, offer.acceptedByReviewerId),
    consent:
      offer.status === "accepted" ? await offerConsent(db, offer.id) : null,
    contactedAt: offer.contactedAt,
    contactMessage: offer.contactMessage,
    currency: offer.currency,
    // The round the offer is answered on (EXTRA-06 records a decline on it).
    currentRoundId: current.id,
    deciderName: owner.deciderName,
    declinedAt: offer.declinedAt,
    declinedByName: await reviewerName(db, offer.declinedByReviewerId),
    delayDays: offer.delayDays,
    deliverableId: target.deliverableId,
    expiresAt: offer.expiresAt,
    forwardedAt: offer.forwardedAt,
    id: offer.id,
    // The light round the decider can choose instead (EXTRA-08); once
    // accepted, the amounts above are those of the chosen size.
    light:
      offer.status !== "accepted" && offer.lightPriceCents !== null
        ? offerAmounts(offer.lightPriceCents, offer.vatRateBps)
        : null,
    paidAt: offer.paidAt,
    requirePayment: offer.requirePayment,
    // The round the agreement grants: the open one, or the next.
    round: opensBatch ? position : position + 1,
    size: offer.size,
    status: offer.status,
    vatRateBps: offer.vatRateBps,
  };
}

type Offer = NonNullable<Awaited<ReturnType<typeof currentOffer>>>;

async function openOffer(
  context: { db: Database; stripe: StripeClient | null },
  projectId: string,
  input: { offerId: string; versionId: string },
  proposer: Proposer
) {
  const offer = await currentOffer(
    context.db,
    context.stripe,
    projectId,
    input.versionId,
    proposer
  );
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
  offer: Pick<Offer, "deliverableId" | "round">,
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

// A new offer (EXTRA-01) is emailed to the client's decider with the review
// link, unless they proposed it themselves, and to the editor (NOTIF-01). The
// offer stands either way: a failed email is only logged.
async function announceOffer(
  db: Database,
  proposer: Proposer,
  proposal: {
    offer: typeof extraRoundOffer.$inferSelect;
    round: number;
    versionId: string;
  }
) {
  const { notifications } = proposer;
  if (!proposer.isDecider) {
    try {
      await emailDecider(
        db,
        notifications,
        { deliverableId: proposal.offer.deliverableId, round: proposal.round },
        proposer
      );
      // Counts as forwarded: the reviewer's "forward" won't send it again
      // within the hour.
      await db
        .update(extraRoundOffer)
        .set({ forwardedAt: new Date() })
        .where(eq(extraRoundOffer.id, proposal.offer.id));
    } catch (error) {
      console.error("Extra round offer email to the decider failed", error);
    }
  }
  const editor = await versionEditor(db, proposal.versionId);
  if (!editor) {
    return;
  }
  await notifyEditor(db, editor, "extra_round_proposed", [
    { actorName: proposer.reviewerName, roundNumber: proposal.round },
  ]);
  if (!editor.preferences.extra_round_proposed.email) {
    return;
  }
  const locale = resolveLocale(editor.locale);
  try {
    await sendEmail(
      notifications.email,
      extraRoundProposedEmail(locale, editor.editorEmail, {
        deliverableTitle: editor.deliverableTitle,
        price: new Intl.NumberFormat(locale, {
          currency: proposal.offer.currency,
          style: "currency",
        }).format(proposal.offer.priceCents / CENTS_PER_UNIT),
        projectName: editor.projectName,
        reviewerName: proposer.reviewerName,
        roundNumber: proposal.round,
        url: `${notifications.appUrl}/projects/${editor.projectId}`,
      })
    );
  } catch (error) {
    console.error("Extra round offer email to the editor failed", error);
  }
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
      size: offer.size ?? "full",
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

// The project and workspace an offer's deliverable belongs to, for its
// payment (EXTRA-04).
async function offerOwner(db: Database, deliverableId: string) {
  const [row] = await db
    .select({
      deliverableTitle: deliverable.title,
      locale: workspace.locale,
      plan: workspace.plan,
      planStatus: workspace.planStatus,
      projectName: project.name,
      stripeAccountId: workspace.stripeAccountId,
      stripePaymentsActive: workspace.stripePaymentsActive,
      trialEndsAt: workspace.trialEndsAt,
      workspaceId: workspace.id,
    })
    .from(deliverable)
    .innerJoin(project, eq(deliverable.projectId, project.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(eq(deliverable.id, deliverableId));
  return row;
}

// The editor's connected account an offer is paid on, checked with Stripe
// right before taking the payment (EXTRA-04), and the line's label in the
// workspace language.
async function paymentAccount(
  context: { db: Database; stripe: StripeClient | null },
  offer: Offer
) {
  const row = await offerOwner(context.db, offer.deliverableId);
  const { stripe } = context;
  const active =
    stripe !== null &&
    row !== undefined &&
    canTakeRoundPayments(stripe, row) &&
    row.stripeAccountId !== null &&
    (await fetchPaymentsActive(stripe, row.stripeAccountId));
  if (!(active && row?.stripeAccountId)) {
    if (row?.stripePaymentsActive) {
      await context.db
        .update(workspace)
        .set({ stripePaymentsActive: false })
        .where(eq(workspace.id, row.workspaceId));
    }
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "Online payment is unavailable for this offer",
    });
  }
  const locale = resolveLocale(row.locale);
  return {
    account: {
      id: row.stripeAccountId,
      label: extraRoundLabel(locale, offer, row),
      locale,
    },
    stripe,
  };
}

export const extraRoundRouter = {
  // The decider accepts the offer on screen (EXTRA-02): they tick the
  // agreement and type the code emailed by review.requestOtp. The answer is
  // recorded once, and proves the decider's email. The agreement record
  // (EXTRA-03) is written in the same transaction, with the text shown.
  // Without payment asked, the agreement also creates the billable line the
  // editor invoices, and grants the round at once (EXTRA-05).
  accept: publicProcedure
    .input(
      offerInput.extend({
        agreed: z.literal(true),
        code: reviewerCodeSchema,
        shown: consentShownSchema,
        // The size the decider chose (EXTRA-08); full when the terms price
        // no light round.
        size: z.enum(EXTRA_ROUND_SIZES).default("full"),
      })
    )
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const { projectId } = context.reviewLink;
      const proposed = await openOffer(
        context,
        projectId,
        input,
        proposerOf(context, decider, input.token)
      );
      const chosen = input.size === "light" ? proposed.light : proposed;
      if (!chosen) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This offer has no light round",
        });
      }
      // From here on the offer is the round agreed: its size and amounts.
      const offer: Offer = {
        ...proposed,
        ...offerAmounts(chosen.netCents, proposed.vatRateBps),
        light: null,
        size: input.size,
      };
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
            priceCents: offer.netCents,
            size: offer.size,
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
            id: consentRecord.id,
            name: consentRecord.name,
            snapshotHash: consentRecord.snapshotHash,
          });
        if (record && !offer.requirePayment) {
          await insertExtraRoundLine(tx, {
            agreement: snapshot,
            consentRecordId: record.id,
            createdAt: now,
            paidAt: null,
            projectId,
          });
        }
        await tx
          .update(reviewer)
          .set({ verifiedAt: now })
          .where(eq(reviewer.id, decider.id));
        return record ?? null;
      });
      if (!offer.requirePayment) {
        await openAgreedRound(context.db, offer.id);
      }
      if (consent) {
        await emailReceipt(
          context.db,
          context.notifications,
          consent.id,
          "agreed"
        );
        await notifyVersionEditor(
          context.db,
          input.versionId,
          "extra_round_accepted",
          [{ actorName: decider.name, roundNumber: proposed.round }]
        );
      }
      return {
        ...offer,
        acceptedAt: now,
        acceptedByName: decider.name,
        consent,
        status: "accepted" as const,
      };
    }),

  // The decider pays an accepted offer that asks for it (EXTRA-04): a
  // Checkout Session on the editor's connected account (direct charge),
  // reusing the one still open so a client can't pay twice. Only the
  // webhook confirms the payment.
  checkoutUrl: publicProcedure
    .input(offerInput)
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const { projectId } = context.reviewLink;
      const offer = await currentOffer(
        context.db,
        context.stripe,
        projectId,
        input.versionId,
        proposerOf(context, decider, input.token)
      );
      if (
        offer?.id !== input.offerId ||
        offer.status !== "accepted" ||
        !offer.requirePayment ||
        offer.paidAt
      ) {
        throw new ORPCError("CONFLICT", {
          message: "This offer isn't waiting for a payment",
        });
      }
      const { account, stripe } = await paymentAccount(context, offer);
      const [saved] = await context.db
        .select({ sessionId: extraRoundOffer.stripeCheckoutSessionId })
        .from(extraRoundOffer)
        .where(eq(extraRoundOffer.id, offer.id));
      if (saved?.sessionId) {
        const open = await stripe.checkout.sessions.retrieve(
          saved.sessionId,
          {},
          { stripeAccount: account.id }
        );
        if (open.status === "open" && open.url) {
          return { url: open.url };
        }
      }
      const reviewUrl = `${context.notifications.appUrl}/r/${input.token}`;
      const session = await stripe.checkout.sessions.create(
        {
          // The offer is agreed and invoiced in the workspace currency: no
          // conversion to the client's local currency.
          adaptive_pricing: { enabled: false },
          cancel_url: `${reviewUrl}?payment=cancelled`,
          client_reference_id: offer.id,
          customer_email: decider.email,
          line_items: [
            {
              price_data: {
                currency: offer.currency.toLowerCase(),
                product_data: { name: account.label },
                unit_amount: offer.grossCents,
              },
              quantity: 1,
            },
          ],
          locale: account.locale,
          metadata: { offerId: offer.id },
          mode: "payment",
          payment_intent_data: { metadata: { offerId: offer.id } },
          success_url: `${reviewUrl}?payment=success`,
        },
        { stripeAccount: account.id }
      );
      await context.db
        .update(extraRoundOffer)
        .set({ stripeCheckoutSessionId: session.id })
        .where(eq(extraRoundOffer.id, offer.id));
      if (!session.url) {
        throw new Error(`Checkout session ${session.id} has no URL`);
      }
      return { url: session.url };
    }),

  // The decider then writes to the editor (EXTRA-06): the message is kept
  // on the declined offer for the project history and emailed to the
  // workspace owner, who replies straight to the decider. One message per
  // declined offer; a failed email releases it so the decider can retry.
  contactEditor: publicProcedure
    .input(
      offerInput.extend({
        message: z.string().trim().min(1).max(EXTRA_ROUND_CONTACT_MAX_LENGTH),
      })
    )
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const { projectId } = context.reviewLink;
      const offer = await currentOffer(
        context.db,
        context.stripe,
        projectId,
        input.versionId,
        proposerOf(context, decider, input.token)
      );
      const conflict = new ORPCError("CONFLICT", {
        message: "The editor was already contacted about this offer",
      });
      if (offer?.id !== input.offerId || offer.status !== "declined") {
        throw conflict;
      }
      const now = new Date();
      const [claimed] = await context.db
        .update(extraRoundOffer)
        .set({ contactedAt: now, contactMessage: input.message })
        .where(
          and(
            eq(extraRoundOffer.id, offer.id),
            eq(extraRoundOffer.status, "declined"),
            isNull(extraRoundOffer.contactedAt)
          )
        )
        .returning({
          contactedAt: extraRoundOffer.contactedAt,
          contactMessage: extraRoundOffer.contactMessage,
        });
      if (!claimed) {
        throw conflict;
      }
      try {
        const [row] = await context.db
          .select({
            deliverableTitle: deliverable.title,
            editorEmail: user.email,
            locale: workspace.locale,
            projectName: project.name,
          })
          .from(deliverable)
          .innerJoin(project, eq(deliverable.projectId, project.id))
          .innerJoin(workspace, eq(project.workspaceId, workspace.id))
          .innerJoin(user, eq(workspace.ownerUserId, user.id))
          .where(eq(deliverable.id, offer.deliverableId));
        if (!row) {
          throw new Error(`Deliverable ${offer.deliverableId} not found`);
        }
        await sendEmail(
          context.notifications.email,
          extraRoundContactEmail(resolveLocale(row.locale), row.editorEmail, {
            deciderEmail: decider.email,
            deciderName: decider.name,
            deliverableTitle: row.deliverableTitle,
            message: input.message,
            projectName: row.projectName,
            roundNumber: offer.round,
            url: `${context.notifications.appUrl}/projects/${projectId}`,
          })
        );
      } catch (error) {
        await context.db
          .update(extraRoundOffer)
          .set({ contactedAt: null, contactMessage: null })
          .where(eq(extraRoundOffer.id, offer.id));
        console.error("Extra round contact email failed", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          cause: error,
          message: "Couldn't email the editor",
        });
      }
      return claimed;
    }),

  // The decider declines the offer (EXTRA-06, §7.3 proposed -> declined):
  // the batch's comments stay as they are, no round opens, and the decider
  // goes on to approve the current version or write to the editor. The
  // answer stands on the current round until the next version.
  decline: publicProcedure
    .input(offerInput)
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      const decider = requireDecider(context.reviewer, context.reviewerClient);
      const { projectId } = context.reviewLink;
      const offer = await openOffer(
        context,
        projectId,
        input,
        proposerOf(context, decider, input.token)
      );
      const now = new Date();
      const [declined] = await context.db
        .update(extraRoundOffer)
        .set({
          declinedAt: now,
          declinedByReviewerId: decider.id,
          declinedRoundId: offer.currentRoundId,
          status: "declined",
        })
        .where(
          and(
            eq(extraRoundOffer.id, offer.id),
            eq(extraRoundOffer.status, "proposed"),
            gt(extraRoundOffer.expiresAt, now)
          )
        )
        .returning({ id: extraRoundOffer.id });
      if (!declined) {
        throw new ORPCError("CONFLICT", {
          message: "This offer is no longer waiting for an answer",
        });
      }
      return {
        ...offer,
        declinedAt: now,
        declinedByName: decider.name,
        status: "declined" as const,
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
      const offer = await openOffer(
        context,
        projectId,
        input,
        proposerOf(context, sender, input.token)
      );
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
    .handler(async ({ context, input: { token, versionId } }) => {
      const viewer = requireReviewer(context.reviewer);
      const offer = await currentOffer(
        context.db,
        context.stripe,
        context.reviewLink.projectId,
        versionId,
        proposerOf(context, viewer, token)
      );
      return offer
        ? {
            ...offer,
            canAccept: isDeciderEmail(context.reviewerClient, viewer.email),
          }
        : null;
    }),

  // The agreement receipt of an accepted offer as a PDF (EXTRA-07), for any
  // identified reviewer of the project, in the page's language.
  receipt: publicProcedure
    .input(
      z.object({
        locale: z.enum(LOCALES),
        offerId: z.string().min(1),
        token: reviewTokenSchema,
      })
    )
    .use(requireReviewLink)
    .handler(async ({ context, input }) => {
      requireReviewer(context.reviewer);
      const receipt = await findReceipt(
        context.db,
        and(
          eq(consentRecord.offerId, input.offerId),
          eq(consentRecord.projectId, context.reviewLink.projectId)
        )
      );
      return receiptFile(receipt, input.locale);
    }),
};
