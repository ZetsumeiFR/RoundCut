import { ORPCError } from "@orpc/server";
import { LOCALES, type Locale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { and, eq, type SQL } from "drizzle-orm";
import { PDFDocument, rgb } from "pdf-lib";
import z from "zod";

import {
  Column,
  drawBadge,
  drawFooter,
  drawSidebarRule,
  embedFonts,
  encodable,
  fill,
  MAIN_WIDTH,
  MAIN_X,
  MARGIN,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  SIDEBAR_WIDTH,
} from "./pdf-layout";

// The parts of a version approval record (APPR-01) the validation
// certificate shows. Like the receipt, it reads the sealed record, never the
// live project. Approvals sealed before APPR-04 carry no file fingerprint.
const approvalSnapshotSchema = z.object({
  project: z.object({
    deliverable: z.object({ title: z.string() }),
    name: z.string(),
    version: z.object({
      fileName: z.string(),
      number: z.number(),
      sha256: z.string().nullable().default(null),
      sizeBytes: z.number(),
    }),
    workspace: z.string(),
  }),
  request: z.object({ ip: z.string().nullable() }),
  shown: z.object({ lines: z.array(z.string()), locale: z.enum(LOCALES) }),
});

export type Certificate = Awaited<ReturnType<typeof findCertificate>>;

// The approval record of a version matching `where`; a version not approved
// reads as missing.
export async function findCertificate(db: Database, where: SQL | undefined) {
  const [row] = await db
    .select({
      createdAt: consentRecord.createdAt,
      email: consentRecord.email,
      id: consentRecord.id,
      name: consentRecord.name,
      snapshot: consentRecord.snapshot,
      snapshotHash: consentRecord.snapshotHash,
    })
    .from(consentRecord)
    .where(and(eq(consentRecord.kind, "approval"), where));
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Certificate not found" });
  }
  const { snapshot, ...record } = row;
  return { ...record, approval: approvalSnapshotSchema.parse(snapshot) };
}

const labels = {
  en: {
    approved: "Approved",
    approvedOn: "on {date}",
    certificate: "Certificate",
    file: "File",
    fileFingerprint: "File SHA-256 fingerprint",
    fileFingerprintMissing:
      "Not recorded: this version was published before RoundCut computed file fingerprints.",
    fileFingerprintNote:
      "Computed by RoundCut from the stored file when the version was published: only a bit-for-bit identical file has this fingerprint.",
    fingerprint: "Record SHA-256 fingerprint",
    fingerprintNote:
      "The fingerprint seals the approval record: the signer, the time, the connection, the file and the text shown. Any change to the record changes it.",
    generated: "Generated on {date} by RoundCut.",
    ip: "Connection",
    item: "{deliverable} · Version {version}",
    project: "Project",
    shown: "Text accepted",
    signer: "Approved by",
    size: "Size",
    subject: "What was approved",
    time: "Time (UTC)",
    title: "Validation certificate",
    unknown: "Unknown",
    version: "Approved version",
  },
  fr: {
    approved: "Validée",
    approvedOn: "le {date}",
    certificate: "Certificat",
    file: "Fichier",
    fileFingerprint: "Empreinte SHA-256 du fichier",
    fileFingerprintMissing:
      "Non enregistrée : cette version a été publiée avant que RoundCut calcule les empreintes des fichiers.",
    fileFingerprintNote:
      "Calculée par RoundCut sur le fichier stocké à la publication de la version : seul un fichier identique au bit près a cette empreinte.",
    fingerprint: "Empreinte SHA-256 du journal",
    fingerprintNote:
      "L'empreinte scelle le journal de validation : le signataire, l'horodatage, la connexion, le fichier et le texte affichés. Toute modification du journal la change.",
    generated: "Généré le {date} par RoundCut.",
    ip: "Connexion",
    item: "{deliverable} · Version {version}",
    project: "Projet",
    shown: "Texte accepté",
    signer: "Validé par",
    size: "Taille",
    subject: "Objet de la validation",
    time: "Horodatage (UTC)",
    title: "Certificat de validation",
    unknown: "Inconnue",
    version: "Version validée",
  },
} satisfies Record<Locale, Record<string, string>>;

const BYTES_PER_MEGABYTE = 1_000_000;

const approvedColors = {
  background: rgb(0.88, 0.97, 0.9),
  text: rgb(0.06, 0.45, 0.2),
};

// The validation certificate (APPR-04), laid out like the agreement receipt:
// the approved version, who approved it, when and from where on the left;
// the file, its fingerprint, the text accepted and the record's seal on the
// right.
export async function renderCertificatePdf(
  certificate: Certificate,
  locale: Locale
) {
  const text = labels[locale];
  const { approval } = certificate;
  const { version } = approval.project;
  const document = await PDFDocument.create();
  document.setTitle(`${text.title} · ${approval.project.name}`);
  document.setAuthor(approval.project.workspace);
  document.setCreator("RoundCut");
  document.setProducer("RoundCut");
  document.setCreationDate(certificate.createdAt);
  const fonts = await embedFonts(document);
  const sanitize = encodable(fonts.regular);
  const utc = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "UTC",
  });
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const megabytes = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "megabyte",
  });
  const first = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const top = PAGE_HEIGHT - MARGIN;

  const side = new Column(
    document,
    first,
    { width: SIDEBAR_WIDTH, x: MARGIN, y: top },
    sanitize
  );
  side.text(approval.project.workspace, {
    font: fonts.bold,
    gap: 14,
    size: 11,
  });
  drawBadge(first, sanitize(text.approved), approvedColors, {
    font: fonts.bold,
    x: MARGIN + SIDEBAR_WIDTH,
    y: top,
  });
  side.label(text.version, fonts);
  side.text(`V${version.number}`, { font: fonts.bold, gap: 4, size: 22 });
  side.text(
    fill(text.approvedOn, { date: day.format(certificate.createdAt) }),
    {
      color: MUTED,
      font: fonts.regular,
      size: 8,
    }
  );
  side.rule(12);
  const meta: [string, string, string?][] = [
    [text.certificate, certificate.id.slice(0, 8).toLocaleUpperCase()],
    [text.signer, certificate.name, certificate.email],
    [text.time, utc.format(certificate.createdAt)],
    [text.ip, approval.request.ip ?? text.unknown],
    [text.project, approval.project.name, approval.project.deliverable.title],
  ];
  for (const [label, value, detail] of meta) {
    side.field(label, value, detail, fonts);
  }
  drawSidebarRule(first);

  const main = new Column(
    document,
    first,
    { width: MAIN_WIDTH, x: MAIN_X, y: top },
    sanitize
  );
  main.text(text.title, { font: fonts.bold, gap: 2, size: 16 });
  main.text(`${approval.project.name} · ${approval.project.workspace}`, {
    color: MUTED,
    font: fonts.regular,
    gap: 18,
    size: 9,
  });
  main.label(text.subject, fonts);
  main.text(
    fill(text.item, {
      deliverable: approval.project.deliverable.title,
      version: version.number,
    }),
    { font: fonts.bold, gap: 6, size: 10.5 }
  );
  main.row(text.file, version.fileName, { font: fonts.regular, size: 9.5 });
  main.y -= 4;
  main.row(
    text.size,
    megabytes.format(version.sizeBytes / BYTES_PER_MEGABYTE),
    {
      font: fonts.regular,
      size: 9.5,
    }
  );
  main.rule(12);
  main.label(text.fileFingerprint, fonts);
  if (version.sha256) {
    main.text(version.sha256, { font: fonts.mono, gap: 4, size: 7.5 });
    main.text(text.fileFingerprintNote, {
      color: MUTED,
      font: fonts.regular,
      size: 7.5,
    });
  } else {
    main.text(text.fileFingerprintMissing, {
      color: MUTED,
      font: fonts.regular,
      size: 8.5,
    });
  }
  main.rule(12);
  main.label(text.shown, fonts);
  for (const line of approval.shown.lines) {
    main.text(line, { font: fonts.regular, gap: 3, size: 8.5 });
  }
  main.rule(12);
  main.label(text.fingerprint, fonts);
  main.text(certificate.snapshotHash, { font: fonts.mono, gap: 4, size: 7.5 });
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

export async function certificateFile(
  certificate: Certificate,
  locale: Locale
) {
  const pdf = await renderCertificatePdf(certificate, locale);
  const name =
    locale === "fr" ? "certificat-validation-v" : "validation-certificate-v";
  return new File(
    [new Uint8Array(pdf)],
    `${name}${certificate.approval.project.version.number}-${certificate.id.slice(0, 8)}.pdf`,
    { type: "application/pdf" }
  );
}
