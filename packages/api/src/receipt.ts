import { ORPCError } from "@orpc/server";
import { agreementReceiptEmail, sendEmail } from "@roundcut/auth/email";
import { LOCALES, type Locale, resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import { EXTRA_ROUND_SIZES } from "@roundcut/db/extra-round";
import { user } from "@roundcut/db/schema/auth";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { extraRoundOffer } from "@roundcut/db/schema/extra-round-offer";
import { project } from "@roundcut/db/schema/project";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { PDFDocument, rgb } from "pdf-lib";
import z from "zod";

import type { Notifications } from "./context";
import {
  type BadgeColors,
  Column,
  drawBadge,
  drawFooter,
  drawSidebarRule,
  embedFonts,
  encodable,
  fill,
  INK,
  MAIN_WIDTH,
  MAIN_X,
  MARGIN,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  SIDEBAR_WIDTH,
} from "./pdf-layout";

// Where an agreed extra round stands with its payment (EXTRA-04/05): paid
// online, waiting for the online payment, or invoiced by the editor.
export const RECEIPT_PAYMENT_STATUSES = [
  "paid",
  "awaiting_payment",
  "to_invoice",
] as const;

export type ReceiptPaymentStatus = (typeof RECEIPT_PAYMENT_STATUSES)[number];

// The parts of an extra round agreement record (EXTRA-03) a receipt shows.
// The record is sealed: the receipt reads it, never the live project, so a
// renamed project or a changed price doesn't rewrite what was agreed.
const agreementSnapshotSchema = z.object({
  agreedAt: z.string(),
  offer: z.object({
    currency: z.string(),
    delayDays: z.number(),
    grossCents: z.number(),
    netCents: z.number(),
    round: z.number(),
    // Records sealed before EXTRA-08 are full rounds.
    size: z.enum(EXTRA_ROUND_SIZES).default("full"),
    vatCents: z.number(),
    vatRateBps: z.number(),
  }),
  project: z.object({
    deliverable: z.object({ title: z.string() }),
    name: z.string(),
    version: z.object({ number: z.number() }),
    workspace: z.string(),
  }),
  request: z.object({ ip: z.string().nullable() }),
  shown: z.object({ lines: z.array(z.string()), locale: z.enum(LOCALES) }),
});

const receiptColumns = {
  createdAt: consentRecord.createdAt,
  email: consentRecord.email,
  id: consentRecord.id,
  name: consentRecord.name,
  ownerEmail: user.email,
  paidAt: extraRoundOffer.paidAt,
  projectId: consentRecord.projectId,
  requirePayment: extraRoundOffer.requirePayment,
  snapshot: consentRecord.snapshot,
  snapshotHash: consentRecord.snapshotHash,
  workspaceLocale: workspace.locale,
};

function toReceipt<
  Row extends {
    paidAt: Date | null;
    requirePayment: boolean;
    snapshot: unknown;
  },
>(row: Row) {
  const { snapshot, paidAt, requirePayment, ...record } = row;
  let status: ReceiptPaymentStatus = "to_invoice";
  if (paidAt) {
    status = "paid";
  } else if (requirePayment) {
    status = "awaiting_payment";
  }
  return {
    ...record,
    agreement: agreementSnapshotSchema.parse(snapshot),
    paidAt,
    status,
  };
}

export type Receipt = Awaited<ReturnType<typeof findReceipts>>[number];

// The extra round agreement records matching `where`, latest first, with
// the live payment status of their offer.
export async function findReceipts(db: Database, where: SQL | undefined) {
  const rows = await db
    .select(receiptColumns)
    .from(consentRecord)
    .innerJoin(extraRoundOffer, eq(consentRecord.offerId, extraRoundOffer.id))
    .innerJoin(project, eq(consentRecord.projectId, project.id))
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .innerJoin(user, eq(workspace.ownerUserId, user.id))
    .where(and(eq(consentRecord.kind, "extra_round"), where))
    .orderBy(desc(consentRecord.createdAt));
  return rows.map(toReceipt);
}

export async function findReceipt(db: Database, where: SQL | undefined) {
  const [receipt] = await findReceipts(db, where);
  if (!receipt) {
    throw new ORPCError("NOT_FOUND", { message: "Receipt not found" });
  }
  return receipt;
}

const labels = {
  en: {
    agreedOn: "on {date}",
    awaiting_payment: "Payment pending",
    delay: "Delivery within {days} days of the next version",
    deliverable: "Deliverable",
    fingerprint: "SHA-256 fingerprint",
    fingerprintNote:
      "The fingerprint seals the agreement record: the signer, the time, the connection, the amounts and the text shown. Any change to the record changes it.",
    generated: "Generated on {date} by RoundCut.",
    ip: "Connection",
    item: "Extra round {round}",
    itemDetail: "{deliverable} · Version {version}",
    itemLight: "Light extra round {round}",
    net: "Total excl. VAT",
    paid: "Paid",
    paidOn: "Paid online on {date}.",
    pendingNote: "Online payment pending: the round opens once it is paid.",
    project: "Project",
    receipt: "Receipt",
    shown: "Text accepted",
    signer: "Signed by",
    subject: "Agreement",
    time: "Time (UTC)",
    title: "Agreement receipt",
    to_invoice: "To be invoiced",
    toInvoiceNote: "{studio} invoices this round separately.",
    total: "Total incl. VAT",
    totalLabel: "Total incl. VAT",
    unknown: "Unknown",
    vat: "VAT ({rate})",
  },
  fr: {
    agreedOn: "le {date}",
    awaiting_payment: "Paiement en attente",
    delay: "Livraison sous {days} jours après la version suivante",
    deliverable: "Livrable",
    fingerprint: "Empreinte SHA-256",
    fingerprintNote:
      "L'empreinte scelle le journal d'accord : le signataire, l'horodatage, la connexion, les montants et le texte affichés. Toute modification du journal la change.",
    generated: "Généré le {date} par RoundCut.",
    ip: "Connexion",
    item: "Tour supplémentaire {round}",
    itemDetail: "{deliverable} · Version {version}",
    itemLight: "Tour supplémentaire léger {round}",
    net: "Total HT",
    paid: "Payé",
    paidOn: "Payé en ligne le {date}.",
    pendingNote:
      "Paiement en ligne en attente : le tour s'ouvre dès qu'il est réglé.",
    project: "Projet",
    receipt: "Reçu",
    shown: "Texte accepté",
    signer: "Signataire",
    subject: "Objet de l'accord",
    time: "Horodatage (UTC)",
    title: "Reçu d'accord",
    to_invoice: "À facturer",
    toInvoiceNote: "{studio} facture ce tour séparément.",
    total: "Total TTC",
    totalLabel: "Total TTC",
    unknown: "Inconnue",
    vat: "TVA ({rate})",
  },
} satisfies Record<Locale, Record<string, string>>;

const CENTS_PER_UNIT = 100;
const BASIS_POINTS = 10_000;

const statusColors: Record<ReceiptPaymentStatus, BadgeColors> = {
  awaiting_payment: {
    background: rgb(1, 0.95, 0.85),
    text: rgb(0.6, 0.35, 0),
  },
  paid: { background: rgb(0.88, 0.97, 0.9), text: rgb(0.06, 0.45, 0.2) },
  to_invoice: { background: rgb(0.93, 0.93, 0.95), text: INK },
};

// The agreement receipt (EXTRA-07) as a one-to-two page A4 PDF, laid out as
// a statement: the total, payment status and who/when/where on the left,
// what was agreed, its amounts and the sealed text on the right.
export async function renderReceiptPdf(receipt: Receipt, locale: Locale) {
  const text = labels[locale];
  const { agreement } = receipt;
  const { offer } = agreement;
  const document = await PDFDocument.create();
  document.setTitle(`${text.title} · ${agreement.project.name}`);
  document.setAuthor(agreement.project.workspace);
  document.setCreator("RoundCut");
  document.setProducer("RoundCut");
  document.setCreationDate(receipt.createdAt);
  const fonts = await embedFonts(document);
  const sanitize = encodable(fonts.regular);
  const money = new Intl.NumberFormat(locale, {
    currency: offer.currency,
    style: "currency",
  });
  const amount = (cents: number) => money.format(cents / CENTS_PER_UNIT);
  const utc = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "UTC",
  });
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const percent = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    style: "percent",
  });
  const first = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const top = PAGE_HEIGHT - MARGIN;

  // Sidebar: studio, status, total and the record's metadata.
  const side = new Column(
    document,
    first,
    { width: SIDEBAR_WIDTH, x: MARGIN, y: top },
    sanitize
  );
  side.text(agreement.project.workspace, {
    font: fonts.bold,
    gap: 14,
    size: 11,
  });
  drawBadge(
    first,
    sanitize(text[receipt.status]),
    statusColors[receipt.status],
    {
      font: fonts.bold,
      x: MARGIN + SIDEBAR_WIDTH,
      y: top,
    }
  );
  side.label(text.totalLabel, fonts);
  side.text(amount(offer.grossCents), { font: fonts.bold, gap: 4, size: 22 });
  side.text(fill(text.agreedOn, { date: day.format(receipt.createdAt) }), {
    color: MUTED,
    font: fonts.regular,
    size: 8,
  });
  side.rule(12);
  const meta: [string, string, string?][] = [
    [text.receipt, receipt.id.slice(0, 8).toLocaleUpperCase()],
    [text.signer, receipt.name, receipt.email],
    [text.time, utc.format(receipt.createdAt)],
    [text.ip, agreement.request.ip ?? text.unknown],
    [text.project, agreement.project.name, agreement.project.deliverable.title],
  ];
  for (const [label, value, detail] of meta) {
    side.field(label, value, detail, fonts);
  }
  drawSidebarRule(first);

  // Main pane: what was agreed, its amounts, the text shown and the seal.
  const main = new Column(
    document,
    first,
    { width: MAIN_WIDTH, x: MAIN_X, y: top },
    sanitize
  );
  main.text(text.title, { font: fonts.bold, gap: 2, size: 16 });
  main.text(`${agreement.project.name} · ${agreement.project.workspace}`, {
    color: MUTED,
    font: fonts.regular,
    gap: 18,
    size: 9,
  });
  main.label(text.subject, fonts);
  main.row(
    fill(offer.size === "light" ? text.itemLight : text.item, {
      round: offer.round,
    }),
    amount(offer.netCents),
    {
      font: fonts.bold,
      size: 10.5,
      strong: true,
    }
  );
  main.text(
    fill(text.itemDetail, {
      deliverable: agreement.project.deliverable.title,
      version: agreement.project.version.number,
    }),
    { color: MUTED, font: fonts.regular, gap: 1, size: 8.5 }
  );
  main.text(fill(text.delay, { days: offer.delayDays }), {
    color: MUTED,
    font: fonts.regular,
    size: 8.5,
  });
  main.rule(10);
  main.row(text.net, amount(offer.netCents), {
    font: fonts.regular,
    size: 9.5,
  });
  main.y -= 4;
  main.row(
    fill(text.vat, {
      rate: percent.format(offer.vatRateBps / BASIS_POINTS),
    }),
    amount(offer.vatCents),
    { font: fonts.regular, size: 9.5 }
  );
  main.rule(6);
  main.row(text.total, amount(offer.grossCents), {
    font: fonts.bold,
    size: 12,
    strong: true,
  });
  main.y -= 10;
  let paymentNote = fill(text.toInvoiceNote, {
    studio: agreement.project.workspace,
  });
  if (receipt.status === "paid" && receipt.paidAt) {
    paymentNote = fill(text.paidOn, { date: utc.format(receipt.paidAt) });
  } else if (receipt.status === "awaiting_payment") {
    paymentNote = text.pendingNote;
  }
  main.text(paymentNote, { color: MUTED, font: fonts.regular, size: 8.5 });
  main.rule(12);
  main.label(text.shown, fonts);
  for (const line of agreement.shown.lines) {
    main.text(line, { font: fonts.regular, gap: 3, size: 8.5 });
  }
  main.rule(12);
  main.label(text.fingerprint, fonts);
  main.text(receipt.snapshotHash, { font: fonts.mono, gap: 4, size: 7.5 });
  main.text(text.fingerprintNote, {
    color: MUTED,
    font: fonts.regular,
    size: 7.5,
  });

  drawFooter(
    document,
    sanitize(fill(text.generated, { date: utc.format(new Date()) })),
    fonts.regular
  );
  return document.save();
}

export function receiptFileName(receipt: Receipt, locale: Locale) {
  const name = locale === "fr" ? "recu-accord-tour" : "agreement-receipt-round";
  return `${name}-${receipt.agreement.offer.round}-${receipt.id.slice(0, 8)}.pdf`;
}

export async function receiptFile(receipt: Receipt, locale: Locale) {
  const pdf = await renderReceiptPdf(receipt, locale);
  return new File([new Uint8Array(pdf)], receiptFileName(receipt, locale), {
    type: "application/pdf",
  });
}

// Emails the receipt to the decider, in the language they agreed in, and to
// the workspace owner, in the workspace language: when they agree, and
// again once the online payment is confirmed. A failed email is logged and
// never undoes the agreement or the payment.
export async function emailReceipt(
  db: Database,
  notifications: Notifications,
  consentId: string,
  event: "agreed" | "paid"
) {
  try {
    const receipt = await findReceipt(db, eq(consentRecord.id, consentId));
    const { agreement } = receipt;
    const recipients: [string, Locale][] = [
      [receipt.email, agreement.shown.locale],
      [receipt.ownerEmail, resolveLocale(receipt.workspaceLocale)],
    ];
    const results = await Promise.allSettled(
      recipients.map(async ([to, locale]) => {
        const pdf = await renderReceiptPdf(receipt, locale);
        await sendEmail(
          notifications.email,
          agreementReceiptEmail(
            locale,
            to,
            {
              deliverableTitle: agreement.project.deliverable.title,
              event,
              projectName: agreement.project.name,
              roundNumber: agreement.offer.round,
              signerName: receipt.name,
              studioName: agreement.project.workspace,
            },
            { content: pdf, filename: receiptFileName(receipt, locale) }
          )
        );
      })
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Agreement receipt email failed", result.reason);
      }
    }
  } catch (error) {
    console.error("Agreement receipt email failed", error);
  }
}
