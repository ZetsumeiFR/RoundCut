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

export interface ExportOptions {
  locale: Locale;
  now: Date;
  timeZone: string;
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

const RECAP_COLUMNS = [
  "client",
  "siren",
  "label",
  "description",
  "quantity",
  "unitPrice",
  "vatRate",
  "net",
  "vat",
  "gross",
] as const;

type RecapColumn = (typeof RECAP_COLUMNS)[number];

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
    recap: {
      columns: {
        client: "Client",
        description: "Description",
        gross: "Total incl. VAT",
        label: "Item",
        net: "Total excl. VAT",
        quantity: "Quantity",
        siren: "SIREN",
        unitPrice: "Unit price excl. VAT",
        vat: "VAT",
        vatRate: "VAT rate (%)",
      },
      fileName: "invoice-summary-by-client",
      total: "Invoice total",
    },
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
    recap: {
      columns: {
        client: "Client",
        description: "Description",
        gross: "Total TTC",
        label: "Désignation",
        net: "Total HT",
        quantity: "Quantité",
        siren: "SIREN",
        unitPrice: "Prix unitaire HT",
        vat: "TVA",
        vatRate: "Taux de TVA (%)",
      },
      fileName: "recapitulatif-factures-par-client",
      total: "Total de la facture",
    },
    statuses: { exported: "Exportée", paid: "Payée", to_invoice: "À facturer" },
  },
} as const satisfies Record<
  Locale,
  {
    columns: Record<Column, string>;
    fileName: string;
    recap: {
      columns: Record<RecapColumn, string>;
      fileName: string;
      total: string;
    };
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
export const CENTS_PER_UNIT = 100;
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

// A day's calendar parts in the workspace's time zone.
export const calendarDay = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  return (date: Date) => {
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.formatToParts(date).find((item) => item.type === type)?.value ?? "";
    return { day: part("day"), month: part("month"), year: part("year") };
  };
};

// In the workspace's time zone: 20/11/2026 in French, 2026-11-20 in English.
const dateFormat = (locale: Locale, timeZone: string) => {
  const dayOf = calendarDay(timeZone);
  return (date: Date) => {
    const { day, month, year } = dayOf(date);
    return locale === "fr"
      ? `${day}/${month}/${year}`
      : `${year}-${month}-${day}`;
  };
};

// The export day in a file name, e.g. billable-lines-2026-11-20.csv.
export const fileDay = (options: ExportOptions) =>
  dateFormat("en", options.timeZone)(options.now);

// VAT is rounded per line, like the totals on /billing.
export const lineAmounts = (line: CsvLine) =>
  offerAmounts(line.quantity * line.unitPriceCents, line.vatRateBps);

// A line's description: its project, and the deliverable of an extra round.
export const lineDescription = (line: CsvLine) =>
  [line.projectName, line.deliverableTitle].filter(Boolean).join(" · ");

const csvFile = (rows: string[][], locale: Locale, fileName: string) => {
  const csv = rows
    .map((row) =>
      row.map((value) => quoted(value, locale)).join(SEPARATORS[locale])
    )
    .join("\r\n");
  return new File([`${BYTE_ORDER_MARK}${csv}\r\n`], fileName, {
    type: "text/csv;charset=utf-8",
  });
};

const csvFormats = (locale: Locale) => {
  const amount = numberFormat(locale, 2);
  const rate = numberFormat(locale, 0);
  return {
    money: (cents: number) => amount.format(cents / CENTS_PER_UNIT),
    rate: (vatRateBps: number) =>
      rate.format(vatRateBps / BASIS_POINTS_PER_PERCENT),
  };
};

// The billable lines as a CSV file (BILL-04, §6.10) for the editor's
// invoicing tool, in the language of the page that exports them.
export function billableLinesCsv(lines: CsvLine[], options: ExportOptions) {
  const { locale } = options;
  const text = TEXT[locale];
  const date = dateFormat(locale, options.timeZone);
  const { money, rate } = csvFormats(locale);
  const rows = lines.map((line) => {
    const totals = lineAmounts(line);
    return [
      date(line.createdAt),
      line.clientName,
      line.siren ?? "",
      line.projectName,
      line.deliverableTitle ?? "",
      line.label,
      String(line.quantity),
      money(line.unitPriceCents),
      rate(line.vatRateBps),
      money(totals.netCents),
      money(totals.vatCents),
      money(totals.grossCents),
      line.agreementId ?? "",
      text.statuses[line.status],
    ];
  });
  return csvFile(
    [COLUMNS.map((column) => text.columns[column]), ...rows],
    locale,
    `${text.fileName}-${fileDay(options)}.csv`
  );
}

// The lines grouped into one invoice per client, each followed by its
// totals (BILL-05): Indy, Tiime and Freebe import no invoice lines, so the
// editor copies each group into a new invoice, item by item, and checks
// the totals match.
export function invoiceSummaryCsv(lines: CsvLine[], options: ExportOptions) {
  const { locale } = options;
  const text = TEXT[locale].recap;
  const { money, rate } = csvFormats(locale);
  const clients = Map.groupBy(
    lines.toSorted((a, b) => a.clientName.localeCompare(b.clientName, locale)),
    (line) => `${line.clientName}\n${line.siren ?? ""}`
  );
  const rows = [...clients.values()].flatMap((group) => {
    const items = group.map((line) => {
      const totals = lineAmounts(line);
      return [
        line.clientName,
        line.siren ?? "",
        line.label,
        lineDescription(line),
        String(line.quantity),
        money(line.unitPriceCents),
        rate(line.vatRateBps),
        money(totals.netCents),
        money(totals.vatCents),
        money(totals.grossCents),
      ];
    });
    const sum = (key: "grossCents" | "netCents" | "vatCents") =>
      money(group.reduce((cents, line) => cents + lineAmounts(line)[key], 0));
    const [first] = group;
    const totalRow = [
      first?.clientName ?? "",
      first?.siren ?? "",
      text.total,
      "",
      "",
      "",
      "",
      sum("netCents"),
      sum("vatCents"),
      sum("grossCents"),
    ];
    return [...items, totalRow];
  });
  return csvFile(
    [RECAP_COLUMNS.map((column) => text.columns[column]), ...rows],
    locale,
    `${text.fileName}-${fileDay(options)}.csv`
  );
}
