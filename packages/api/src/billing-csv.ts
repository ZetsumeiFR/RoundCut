import type { Locale } from "@roundcut/auth/locale";
import type { BillableLineStatus } from "@roundcut/db/billing";
import { offerAmounts } from "@roundcut/db/extra-round";

export interface CsvLine {
  agreementId: string | null;
  clientName: string;
  createdAt: Date;
  deliverableTitle: string | null;
  label: string;
  projectName: string;
  quantity: number;
  siren: string | null;
  status: BillableLineStatus;
  unitPriceCents: number;
  vatRateBps: number;
}

const COLUMNS = [
  "date",
  "client",
  "siren",
  "project",
  "deliverable",
  "label",
  "quantity",
  "unitPrice",
  "vatRate",
  "net",
  "vat",
  "gross",
  "agreement",
  "status",
] as const;

type Column = (typeof COLUMNS)[number];

const TEXT = {
  en: {
    columns: {
      agreement: "Agreement reference",
      client: "Client",
      date: "Date",
      deliverable: "Deliverable",
      gross: "Total incl. VAT",
      label: "Label",
      net: "Total excl. VAT",
      project: "Project",
      quantity: "Quantity",
      siren: "SIREN",
      status: "Payment status",
      unitPrice: "Unit price excl. VAT",
      vat: "VAT",
      vatRate: "VAT rate (%)",
    },
    fileName: "billable-lines",
    statuses: { exported: "Exported", paid: "Paid", to_invoice: "To invoice" },
  },
  fr: {
    columns: {
      agreement: "Référence d'accord",
      client: "Client",
      date: "Date",
      deliverable: "Livrable",
      gross: "Total TTC",
      label: "Libellé",
      net: "Total HT",
      project: "Projet",
      quantity: "Quantité",
      siren: "SIREN",
      status: "Statut de paiement",
      unitPrice: "Prix unitaire HT",
      vat: "TVA",
      vatRate: "Taux de TVA (%)",
    },
    fileName: "lignes-facturables",
    statuses: { exported: "Exportée", paid: "Payée", to_invoice: "À facturer" },
  },
} as const satisfies Record<
  Locale,
  {
    columns: Record<Column, string>;
    fileName: string;
    statuses: Record<BillableLineStatus, string>;
  }
>;

// A French spreadsheet opens `;`-separated files with decimal commas as is
// (§14: imported without any edit); English ones expect `,` and dots.
const SEPARATORS = { en: ",", fr: ";" } as const satisfies Record<
  Locale,
  string
>;
// Excel reads a CSV as UTF-8 only when it starts with a byte order mark.
const BYTE_ORDER_MARK = "\uFEFF";
const CENTS_PER_UNIT = 100;
const BASIS_POINTS_PER_PERCENT = 100;
const NEEDS_QUOTES = {
  en: /[",\r\n]/,
  fr: /[";\r\n]/,
} as const satisfies Record<Locale, RegExp>;
const QUOTE = /"/g;

const quoted = (value: string, locale: Locale) =>
  NEEDS_QUOTES[locale].test(value) ? `"${value.replace(QUOTE, '""')}"` : value;

// Plain numbers, without grouping or currency, so spreadsheets and
// invoicing tools read them as numbers.
const numberFormat = (locale: Locale, minimumFractionDigits: number) =>
  new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits,
    useGrouping: false,
  });

// In the workspace's time zone: 20/11/2026 in French, 2026-11-20 in English.
const dateFormat = (locale: Locale, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  return (date: Date) => {
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.formatToParts(date).find((item) => item.type === type)?.value;
    const [day, month, year] = [part("day"), part("month"), part("year")];
    return locale === "fr"
      ? `${day}/${month}/${year}`
      : `${year}-${month}-${day}`;
  };
};

// The billable lines as a CSV file (BILL-04, §6.10) for the editor's
// invoicing tool, in the language of the page that exports them. VAT is
// rounded per line, like the totals on /billing.
export function billableLinesCsv(
  lines: CsvLine[],
  options: { locale: Locale; now: Date; timeZone: string }
) {
  const { locale, timeZone } = options;
  const text = TEXT[locale];
  const separator = SEPARATORS[locale];
  const date = dateFormat(locale, timeZone);
  const amount = numberFormat(locale, 2);
  const rate = numberFormat(locale, 0);
  const money = (cents: number) => amount.format(cents / CENTS_PER_UNIT);
  const rows = lines.map((line) => {
    const totals = offerAmounts(
      line.quantity * line.unitPriceCents,
      line.vatRateBps
    );
    return [
      date(line.createdAt),
      line.clientName,
      line.siren ?? "",
      line.projectName,
      line.deliverableTitle ?? "",
      line.label,
      String(line.quantity),
      money(line.unitPriceCents),
      rate.format(line.vatRateBps / BASIS_POINTS_PER_PERCENT),
      money(totals.netCents),
      money(totals.vatCents),
      money(totals.grossCents),
      line.agreementId ?? "",
      text.statuses[line.status],
    ];
  });
  const csv = [COLUMNS.map((column) => text.columns[column]), ...rows]
    .map((row) => row.map((value) => quoted(value, locale)).join(separator))
    .join("\r\n");
  const day = dateFormat("en", timeZone)(options.now);
  return new File(
    [`${BYTE_ORDER_MARK}${csv}\r\n`],
    `${text.fileName}-${day}.csv`,
    { type: "text/csv;charset=utf-8" }
  );
}
