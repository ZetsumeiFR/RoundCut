import { ORPCError } from "@orpc/server";
import { type Locale, resolveLocale } from "@roundcut/auth/locale";
import type { Database } from "@roundcut/db";
import {
  type BillableLineStatus,
  billableLineStatusSources,
} from "@roundcut/db/billing";
import type { ExtraRoundSize } from "@roundcut/db/extra-round";
import { billableLine } from "@roundcut/db/schema/billable-line";
import { client } from "@roundcut/db/schema/client";
import { consentRecord } from "@roundcut/db/schema/consent-record";
import { project } from "@roundcut/db/schema/project";
import { workspace } from "@roundcut/db/schema/workspace";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  exportLinesSchema,
  lineStatusSchema,
  manualLineSchema,
} from "../billing";
import { billableLinesCsv } from "../billing-csv";
import { protectedProcedure } from "../index";
import { agreementSnapshotSchema } from "../receipt";
import { getOrCreateWorkspace } from "./workspace";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const FLAT_FEE_LABELS = {
  en: "Flat fee",
  fr: "Forfait",
} as const satisfies Record<Locale, string>;

const ROUND_LABELS = {
  en: { full: "Extra round", light: "Light extra round" },
  fr: { full: "Tour supplémentaire", light: "Tour supplémentaire léger" },
} as const satisfies Record<Locale, Record<ExtraRoundSize, string>>;

// The extra round's label on the Stripe payment and the billable line, in
// the workspace language, naming the light round the decider chose.
export function extraRoundLabel(
  locale: Locale,
  offer: { round: number; size: ExtraRoundSize | null },
  owner: { deliverableTitle: string; projectName: string }
) {
  const round = `${ROUND_LABELS[locale][offer.size ?? "full"]} ${offer.round}`;
  return `${round} · ${owner.projectName} · ${owner.deliverableTitle}`;
}

// The project's flat fee, when it has one, is billed once (BILL-01): its line
// is written with the project, in the workspace currency, VAT rate and
// language.
export async function insertFlatFeeLine(
  tx: Transaction,
  row: typeof project.$inferSelect,
  owner: { currency: string; defaultVatRateBps: number; locale: string }
) {
  if (!row.flatFeeCents) {
    return;
  }
  await tx.insert(billableLine).values({
    clientId: row.clientId,
    currency: owner.currency,
    label: `${FLAT_FEE_LABELS[resolveLocale(owner.locale)]} · ${row.name}`,
    projectId: row.id,
    source: "flat_fee",
    unitPriceCents: row.flatFeeCents,
    vatRateBps: owner.defaultVatRateBps,
    workspaceId: row.workspaceId,
  });
}

// An agreed extra round's line, read from its sealed agreement (EXTRA-03):
// to invoice when the client pays the editor directly (EXTRA-05), paid once
// Stripe confirms the online payment (EXTRA-04). One line per agreement, so a
// webhook redelivery adds nothing.
export async function insertExtraRoundLine(
  db: Database | Transaction,
  line: {
    agreement: {
      offer: {
        currency: string;
        netCents: number;
        round: number;
        size: ExtraRoundSize | null;
        vatRateBps: number;
      };
      project: { deliverable: { title: string }; name: string };
    };
    consentRecordId: string;
    createdAt?: Date;
    paidAt: Date | null;
    projectId: string;
  }
) {
  const [owner] = await db
    .select({
      clientId: project.clientId,
      locale: workspace.locale,
      workspaceId: project.workspaceId,
    })
    .from(project)
    .innerJoin(workspace, eq(project.workspaceId, workspace.id))
    .where(eq(project.id, line.projectId));
  if (!owner) {
    throw new Error(`Project ${line.projectId} not found for its agreement`);
  }
  const { offer, project: agreed } = line.agreement;
  await db
    .insert(billableLine)
    .values({
      clientId: owner.clientId,
      consentRecordId: line.consentRecordId,
      createdAt: line.createdAt,
      currency: offer.currency,
      label: extraRoundLabel(resolveLocale(owner.locale), offer, {
        deliverableTitle: agreed.deliverable.title,
        projectName: agreed.name,
      }),
      paidAt: line.paidAt,
      projectId: line.projectId,
      source: "extra_round",
      status: line.paidAt ? "paid" : "to_invoice",
      unitPriceCents: offer.netCents,
      vatRateBps: offer.vatRateBps,
      workspaceId: owner.workspaceId,
    })
    .onConflictDoNothing({ target: billableLine.consentRecordId });
}

// When a line was exported or paid (BILL-02): marking it back "to invoice"
// clears the export, paying it keeps when it was exported.
const lineStatusTimestamps = (status: BillableLineStatus, now: Date) =>
  status === "paid"
    ? { paidAt: now }
    : { exportedAt: status === "exported" ? now : null };

// The editor's billable lines (BILL, E14), exported to their own invoicing
// tool: flat fees, agreed extra rounds and manual fees.
export const billingRouter = {
  lines: {
    createManual: protectedProcedure
      .input(manualLineSchema)
      .handler(async ({ context, input: { projectId, ...values } }) => {
        const owner = await getOrCreateWorkspace(
          context.db,
          context.session.user
        );
        // Other workspaces' projects read as missing so their ids leak
        // nothing.
        const [owned] = await context.db
          .select({ clientId: project.clientId })
          .from(project)
          .where(
            and(eq(project.id, projectId), eq(project.workspaceId, owner.id))
          );
        if (!owned) {
          throw new ORPCError("NOT_FOUND", { message: "Project not found" });
        }
        const [line] = await context.db
          .insert(billableLine)
          .values({
            ...values,
            clientId: owned.clientId,
            currency: owner.currency,
            projectId,
            source: "manual",
            vatRateBps: owner.defaultVatRateBps,
            workspaceId: owner.id,
          })
          .returning({ id: billableLine.id });
        if (!line) {
          throw new Error("Billable line insert returned no row");
        }
        return line;
      }),
    // The lines shown on /billing (BILL-04), filtered there, as a CSV file in
    // the page's language; ids of other workspaces' lines match nothing.
    // Exporting doesn't mark them exported: the editor does once imported.
    exportCsv: protectedProcedure
      .input(exportLinesSchema)
      .handler(async ({ context, input: { ids, locale } }) => {
        const owner = await getOrCreateWorkspace(
          context.db,
          context.session.user
        );
        const rows = await context.db
          .select({
            agreementId: consentRecord.id,
            agreementSnapshot: consentRecord.snapshot,
            clientName: client.name,
            createdAt: billableLine.createdAt,
            label: billableLine.label,
            projectName: project.name,
            quantity: billableLine.quantity,
            siren: client.siren,
            status: billableLine.status,
            unitPriceCents: billableLine.unitPriceCents,
            vatRateBps: billableLine.vatRateBps,
          })
          .from(billableLine)
          .innerJoin(client, eq(billableLine.clientId, client.id))
          .innerJoin(project, eq(billableLine.projectId, project.id))
          .leftJoin(
            consentRecord,
            eq(billableLine.consentRecordId, consentRecord.id)
          )
          .where(
            and(
              eq(billableLine.workspaceId, owner.id),
              inArray(billableLine.id, ids)
            )
          )
          .orderBy(asc(billableLine.createdAt), asc(billableLine.id));
        // An extra round's deliverable is the one agreed to, read from its
        // sealed agreement like its receipt.
        const lines = rows.map(({ agreementSnapshot, ...row }) => ({
          ...row,
          deliverableTitle: agreementSnapshot
            ? agreementSnapshotSchema.parse(agreementSnapshot).project
                .deliverable.title
            : null,
        }));
        return billableLinesCsv(lines, {
          locale,
          now: new Date(),
          timeZone: owner.timezone,
        });
      }),
    list: protectedProcedure.handler(async ({ context }) => {
      const owner = await getOrCreateWorkspace(
        context.db,
        context.session.user
      );
      return await context.db
        .select({
          client: { id: client.id, name: client.name },
          createdAt: billableLine.createdAt,
          currency: billableLine.currency,
          exportedAt: billableLine.exportedAt,
          id: billableLine.id,
          label: billableLine.label,
          paidAt: billableLine.paidAt,
          project: { id: project.id, name: project.name },
          quantity: billableLine.quantity,
          source: billableLine.source,
          status: billableLine.status,
          unitPriceCents: billableLine.unitPriceCents,
          vatRateBps: billableLine.vatRateBps,
        })
        .from(billableLine)
        .innerJoin(client, eq(billableLine.clientId, client.id))
        .innerJoin(project, eq(billableLine.projectId, project.id))
        .where(eq(billableLine.workspaceId, owner.id))
        .orderBy(desc(billableLine.createdAt), desc(billableLine.id));
    }),
    // The editor marks a line exported or paid by hand (BILL-02); Stripe
    // writes paid extra rounds' lines as paid on its own (EXTRA-04).
    updateStatus: protectedProcedure
      .input(lineStatusSchema)
      .handler(async ({ context, input: { id, status } }) => {
        const owner = await getOrCreateWorkspace(
          context.db,
          context.session.user
        );
        const ownLine = and(
          eq(billableLine.id, id),
          eq(billableLine.workspaceId, owner.id)
        );
        // The allowed source statuses are part of the update itself, so two
        // concurrent marks can never reopen a paid line.
        const sources = billableLineStatusSources(status);
        const now = new Date();
        const [updated] =
          sources.length > 0
            ? await context.db
                .update(billableLine)
                .set({ ...lineStatusTimestamps(status, now), status })
                .where(and(ownLine, inArray(billableLine.status, sources)))
                .returning({
                  exportedAt: billableLine.exportedAt,
                  id: billableLine.id,
                  paidAt: billableLine.paidAt,
                  status: billableLine.status,
                })
            : [];
        if (updated) {
          return updated;
        }
        // Other workspaces' lines read as missing so their ids leak nothing.
        const [current] = await context.db
          .select({ status: billableLine.status })
          .from(billableLine)
          .where(ownLine);
        if (!current) {
          throw new ORPCError("NOT_FOUND", { message: "Line not found" });
        }
        throw new ORPCError("CONFLICT", {
          message: `Cannot mark a ${current.status} line ${status}`,
        });
      }),
  },
};
