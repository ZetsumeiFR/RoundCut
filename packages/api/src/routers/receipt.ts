import { LOCALES } from "@roundcut/auth/locale";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { findReceipt, findReceipts, receiptFile } from "../receipt";
import { findOwnedProject } from "./review-link";

// The extra round agreement receipts of the editor's projects (EXTRA-07).
export const receiptRouter = {
  download: protectedProcedure
    .input(z.object({ id: z.string().min(1), locale: z.enum(LOCALES) }))
    .handler(async ({ context, input }) => {
      const receipt = await findReceipt(
        context.db,
        eq(consentRecord.id, input.id)
      );
      // Another workspace's receipt reads as missing, like its project.
      await findOwnedProject(
        context.db,
        context.session.user,
        receipt.projectId
      );
      return receiptFile(receipt, input.locale);
    }),

  // Every agreement of the project, latest first, including those still
  // waiting for their online payment.
  list: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .handler(async ({ context, input: { projectId } }) => {
      const owned = await findOwnedProject(
        context.db,
        context.session.user,
        projectId
      );
      const receipts = await findReceipts(
        context.db,
        eq(consentRecord.projectId, owned.id)
      );
      return receipts.map(({ agreement, ...receipt }) => ({
        createdAt: receipt.createdAt,
        currency: agreement.offer.currency,
        deliverableTitle: agreement.project.deliverable.title,
        email: receipt.email,
        grossCents: agreement.offer.grossCents,
        id: receipt.id,
        name: receipt.name,
        paidAt: receipt.paidAt,
        round: agreement.offer.round,
        status: receipt.status,
        versionNumber: agreement.project.version.number,
      }));
    }),
};
