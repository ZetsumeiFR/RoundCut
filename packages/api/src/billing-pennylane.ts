import type { Locale } from "@roundcut/auth/locale";

import {
  CENTS_PER_UNIT,
  type CsvLine,
  calendarDay,
  type ExportOptions,
  fileDay,
  lineAmounts,
  lineDescription,
} from "./billing-csv";
import { excelDay, type XlsxCell, xlsxFile } from "./xlsx";

const TEXT = {
  en: {
    columns: [
      "Customer identifier (SIREN)",
      "Customer",
      "Issue date",
      "Label",
      "Description",
      "Quantity",
      "Unit price excl. VAT",
      "VAT rate",
      "Total excl. VAT",
    ],
    fileName: "pennylane-invoice-drafts",
    sheetName: "Invoice drafts",
  },
  fr: {
    columns: [
      "Identifiant client (SIREN)",
      "Client",
      "Date d'émission",
      "Libellé",
      "Description",
      "Quantité",
      "Prix unitaire HT",
      "Taux de TVA",
      "Total HT",
    ],
    fileName: "pennylane-brouillons-factures",
    sheetName: "Brouillons de facture",
  },
} as const satisfies Record<
  Locale,
  { columns: string[]; fileName: string; sheetName: string }
>;

const BASIS_POINTS_PER_VAT_CODE_UNIT = 10;

// Pennylane's VAT codes: FR_200 for 20 %, FR_55 for 5.5 %, exempt for 0 %.
const vatCode = (vatRateBps: number) =>
  vatRateBps === 0
    ? "exempt"
    : `FR_${vatRateBps / BASIS_POINTS_PER_VAT_CODE_UNIT}`;

const money = (cents: number): XlsxCell => ({
  format: "money",
  value: cents / CENTS_PER_UNIT,
});

// The lines as Pennylane invoice drafts to import (BILL-05, "Créer un
// brouillon de facture via Excel"): Pennylane finds the client by SIREN and
// groups lines with the same client and issue date into one draft, so all
// of a client's lines, issued on the export day, become one invoice.
export function pennylaneDraftsXlsx(lines: CsvLine[], options: ExportOptions) {
  const text = TEXT[options.locale];
  const { day, month, year } = calendarDay(options.timeZone)(options.now);
  const issueDate: XlsxCell = {
    format: "date",
    value: excelDay(Number(year), Number(month), Number(day)),
  };
  const rows = lines.map((line): XlsxCell[] => [
    line.siren ?? "",
    line.clientName,
    issueDate,
    line.label,
    lineDescription(line),
    line.quantity,
    money(line.unitPriceCents),
    vatCode(line.vatRateBps),
    money(lineAmounts(line).netCents),
  ]);
  return xlsxFile([[...text.columns], ...rows], {
    fileName: `${text.fileName}-${fileDay(options)}.xlsx`,
    sheetName: text.sheetName,
  });
}
