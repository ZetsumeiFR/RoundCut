"use client";

import { EXPORT_PRESETS, type ExportPreset } from "@roundcut/api/billing";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import {
  BILLABLE_LINE_STATUS_TRANSITIONS,
  BILLABLE_LINE_STATUSES,
  type BillableLineSource,
  type BillableLineStatus,
} from "@roundcut/db/billing";
import { offerAmounts } from "@roundcut/db/extra-round";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@roundcut/ui/components/alert-dialog";
import { Button } from "@roundcut/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@roundcut/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  DataGrid,
  type DataGridFeatures,
  dataGridFeatures,
} from "@roundcut/ui/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@roundcut/ui/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@roundcut/ui/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@roundcut/ui/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@roundcut/ui/components/reui/data-grid/data-grid-table";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@roundcut/ui/components/reui/frame";
import { Separator } from "@roundcut/ui/components/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  DownloadIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchXIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ClientsSkeleton, gridI18n } from "@/components/clients/clients-view";
import { FilterSelect } from "@/components/dashboard/projects-dashboard";
import { saveFile } from "@/components/review/receipt-download-button";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { AddFeeDialog } from "./add-fee-dialog";

type BillingMessages = Messages["billing"];
type BillableLine = Awaited<
  ReturnType<AppRouterClient["billing"]["lines"]["list"]>
>[number];
type LineColumn = Column<DataGridFeatures, BillableLine, unknown>;
type ChangeStatus = (line: BillableLine, status: BillableLineStatus) => void;

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZES = [10, DEFAULT_PAGE_SIZE, 50];
const DEFAULT_SORTING: SortingState = [{ desc: true, id: "date" }];
const CENTS_PER_UNIT = 100;

const STATUS_BADGES = {
  exported: "info-light",
  paid: "success-light",
  to_invoice: "warning-light",
} as const satisfies Record<BillableLineStatus, string>;

const SOURCE_BADGES = {
  extra_round: "primary-light",
  flat_fee: "outline",
  manual: "secondary",
} as const satisfies Record<BillableLineSource, string>;

const lineTotalCents = (line: BillableLine) =>
  line.quantity * line.unitPriceCents;

const ALL = "all";
const PERIODS = [
  "all",
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "lastQuarter",
  "thisYear",
  "lastYear",
] as const;
const MONTHS_PER_QUARTER = 3;
const MONTHS_PER_YEAR = 12;

type Period = (typeof PERIODS)[number];
interface LineFilters {
  clientId: string;
  period: Period;
  status: BillableLineStatus | typeof ALL;
}

const NO_FILTERS: LineFilters = { clientId: ALL, period: "all", status: ALL };

const isPeriod = (value: string): value is Period =>
  (PERIODS as readonly string[]).includes(value);
const isStatusFilter = (value: string): value is LineFilters["status"] =>
  value === ALL ||
  (BILLABLE_LINE_STATUSES as readonly string[]).includes(value);

// The calendar period [start, end) in local time, counted from `now`'s month;
// null for all time.
function periodRange(period: Period, now: Date): [Date, Date] | null {
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = month - (month % MONTHS_PER_QUARTER);
  const months = (from: number, count: number): [Date, Date] => [
    new Date(year, from, 1),
    new Date(year, from + count, 1),
  ];
  switch (period) {
    case "thisMonth":
      return months(month, 1);
    case "lastMonth":
      return months(month - 1, 1);
    case "thisQuarter":
      return months(quarter, MONTHS_PER_QUARTER);
    case "lastQuarter":
      return months(quarter - MONTHS_PER_QUARTER, MONTHS_PER_QUARTER);
    case "thisYear":
      return months(0, MONTHS_PER_YEAR);
    case "lastYear":
      return months(-MONTHS_PER_YEAR, MONTHS_PER_YEAR);
    default:
      return null;
  }
}

function filterLines(lines: BillableLine[], filters: LineFilters, now: Date) {
  const range = periodRange(filters.period, now);
  return lines.filter((line) => {
    const createdAt = new Date(line.createdAt);
    return (
      (filters.clientId === ALL || line.client.id === filters.clientId) &&
      (filters.status === ALL || line.status === filters.status) &&
      (range === null || (createdAt >= range[0] && createdAt < range[1]))
    );
  });
}

interface Totals {
  grossCents: number;
  netCents: number;
  vatCents: number;
}

// Totals excl. VAT, VAT and incl. VAT per currency, VAT rounded per line
// like on an invoice; zero in the workspace currency when nothing matches.
function totalsByCurrency(lines: BillableLine[], currency: string) {
  const totals = new Map<string, Totals>();
  for (const line of lines) {
    const amounts = offerAmounts(lineTotalCents(line), line.vatRateBps);
    const sum = totals.get(line.currency);
    totals.set(line.currency, {
      grossCents: (sum?.grossCents ?? 0) + amounts.grossCents,
      netCents: (sum?.netCents ?? 0) + amounts.netCents,
      vatCents: (sum?.vatCents ?? 0) + amounts.vatCents,
    });
  }
  if (totals.size === 0) {
    totals.set(currency, { grossCents: 0, netCents: 0, vatCents: 0 });
  }
  return [...totals];
}

function SortableHeader({ column }: { column: LineColumn }) {
  return <DataGridColumnHeader column={column} />;
}

function TextCell({ value }: { value: string }) {
  return <span className="block truncate text-sm">{value}</span>;
}

function ProjectCell({ line }: { line: BillableLine }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        className="block truncate text-sm underline-offset-4 transition-colors hover:underline"
        href={`/projects/${line.project.id}`}
      >
        {line.project.name}
      </Link>
      <span className="truncate text-muted-foreground text-xs">
        {line.client.name}
      </span>
    </div>
  );
}

function AmountCell({ value }: { value: string }) {
  return <span className="text-sm tabular-nums">{value}</span>;
}

function StatusMenuItem({
  label,
  line,
  onChange,
  status,
}: {
  label: string;
  line: BillableLine;
  onChange: ChangeStatus;
  status: BillableLineStatus;
}) {
  const handleClick = useCallback(
    () => onChange(line, status),
    [line, onChange, status]
  );
  return <DropdownMenuItem onClick={handleClick}>{label}</DropdownMenuItem>;
}

function ExportMenuItem({
  messages,
  onExport,
  preset,
}: {
  messages: BillingMessages["export"]["presets"][ExportPreset];
  onExport: (preset: ExportPreset) => void;
  preset: ExportPreset;
}) {
  const handleClick = useCallback(() => onExport(preset), [onExport, preset]);
  return (
    <DropdownMenuItem
      className="flex-col items-start gap-0.5"
      onClick={handleClick}
    >
      <span>{messages.title}</span>
      <span className="text-muted-foreground text-xs">
        {messages.description}
      </span>
    </DropdownMenuItem>
  );
}

// Exports the filtered lines (BILL-04) for the editor's invoicing tool
// (BILL-05): any spreadsheet, Pennylane's import, or a per-client recap for
// Indy, Tiime and Freebe.
function ExportMenu({
  ids,
  locale,
  messages,
}: {
  ids: string[];
  locale: Locale;
  messages: BillingMessages["export"];
}) {
  const [busy, setBusy] = useState(false);
  const handleExport = useCallback(
    async (preset: ExportPreset) => {
      setBusy(true);
      try {
        saveFile(await api.billing.lines.exportCsv({ ids, locale, preset }));
      } catch {
        toast.error(messages.error);
      } finally {
        setBusy(false);
      }
    },
    [ids, locale, messages.error]
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={messages.label}
        disabled={busy}
        render={<Button size="sm" type="button" variant="outline" />}
      >
        <DownloadIcon aria-hidden="true" />
        {busy ? messages.exporting : messages.action}
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          {EXPORT_PRESETS.map((preset) => (
            <ExportMenuItem
              key={preset}
              messages={messages.presets[preset]}
              onExport={handleExport}
              preset={preset}
            />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The status badge opens the statuses the line can be marked with (BILL-02);
// "paid" comes last and asks for confirmation since it is final.
function StatusCell({
  line,
  messages,
  onChange,
}: {
  line: BillableLine;
  messages: BillingMessages;
  onChange: ChangeStatus;
}) {
  const badge = (
    <Badge variant={STATUS_BADGES[line.status]}>
      {messages.statuses[line.status]}
    </Badge>
  );
  const targets = BILLABLE_LINE_STATUS_TRANSITIONS[line.status];
  if (targets.length === 0) {
    return badge;
  }
  const moves = targets.filter((status) => status !== "paid");
  const { statusChange } = messages;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={formatMessage(statusChange.actions, {
          label: line.label,
          status: messages.statuses[line.status],
        })}
        render={
          <Button className="-ms-2 gap-1 px-2" size="sm" variant="ghost" />
        }
      >
        {badge}
        <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          {moves.map((status) => (
            <StatusMenuItem
              key={status}
              label={formatMessage(statusChange.moveTo, {
                status: messages.statuses[status],
              })}
              line={line}
              onChange={onChange}
              status={status}
            />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <StatusMenuItem
          label={statusChange.pay}
          line={line}
          onChange={onChange}
          status="paid"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PayDialog({
  busy,
  line,
  messages,
  onConfirm,
  onOpenChange,
}: {
  busy: boolean;
  line: BillableLine | null;
  messages: BillingMessages;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { statusChange } = messages;
  return (
    <AlertDialog onOpenChange={onOpenChange} open={line !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{statusChange.payTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {formatMessage(statusChange.payDescription, {
              label: line?.label ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{statusChange.cancel}</AlertDialogCancel>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? statusChange.paying : statusChange.pay}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const numericMeta = (headerTitle: string) => ({
  cellClassName: "text-end",
  headerClassName: "text-end [&>div]:w-full [&>div]:justify-end",
  headerTitle,
});

function buildColumns(
  messages: BillingMessages,
  locale: Locale,
  onChange: ChangeStatus
): ColumnDef<DataGridFeatures, BillableLine>[] {
  const { columns } = messages;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const amount = (line: BillableLine, cents: number) =>
    new Intl.NumberFormat(locale, {
      currency: line.currency,
      style: "currency",
    }).format(cents / CENTS_PER_UNIT);
  return [
    {
      accessorFn: (line) => new Date(line.createdAt).getTime(),
      cell: ({ row }) => (
        <TextCell value={date.format(new Date(row.original.createdAt))} />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "date",
      meta: { headerTitle: columns.date },
      size: 110,
    },
    {
      accessorFn: (line) => line.project.name.toLocaleLowerCase(),
      cell: ({ row }) => <ProjectCell line={row.original} />,
      header: ({ column }) => <SortableHeader column={column} />,
      id: "project",
      meta: { headerTitle: columns.project },
      size: 200,
    },
    {
      accessorFn: (line) => line.label.toLocaleLowerCase(),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className="w-full truncate text-sm">{row.original.label}</span>
          <Badge variant={SOURCE_BADGES[row.original.source]}>
            {messages.sources[row.original.source]}
          </Badge>
        </div>
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "label",
      meta: { headerTitle: columns.label },
      minSize: 200,
      size: 280,
    },
    {
      accessorFn: (line) => line.quantity,
      cell: ({ row }) => <AmountCell value={String(row.original.quantity)} />,
      header: ({ column }) => <SortableHeader column={column} />,
      id: "quantity",
      meta: numericMeta(columns.quantity),
      size: 64,
    },
    {
      accessorFn: (line) => line.unitPriceCents,
      cell: ({ row }) => (
        <AmountCell value={amount(row.original, row.original.unitPriceCents)} />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "unitPrice",
      meta: numericMeta(columns.unitPrice),
      size: 140,
    },
    {
      accessorFn: lineTotalCents,
      cell: ({ row }) => (
        <AmountCell
          value={amount(row.original, lineTotalCents(row.original))}
        />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "total",
      meta: numericMeta(columns.total),
      size: 130,
    },
    {
      accessorFn: (line) => line.status,
      cell: ({ row }) => (
        <StatusCell
          line={row.original}
          messages={messages}
          onChange={onChange}
        />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "status",
      meta: { headerTitle: columns.status },
      size: 150,
    },
  ];
}

function TotalItem({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={`whitespace-nowrap text-sm tabular-nums ${emphasis ? "font-semibold" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function LineTotals({
  currency,
  lines,
  locale,
  messages,
}: {
  currency: string;
  lines: BillableLine[];
  locale: Locale;
  messages: BillingMessages["totals"];
}) {
  return (
    <section aria-label={messages.label} className="flex flex-col gap-3">
      {totalsByCurrency(lines, currency).map(([code, totals]) => {
        const format = (cents: number) =>
          new Intl.NumberFormat(locale, {
            currency: code,
            style: "currency",
          }).format(cents / CENTS_PER_UNIT);
        return (
          <dl className="grid grid-cols-3 gap-3" key={code}>
            <TotalItem label={messages.net} value={format(totals.netCents)} />
            <TotalItem label={messages.vat} value={format(totals.vatCents)} />
            <TotalItem
              emphasis
              label={messages.gross}
              value={format(totals.grossCents)}
            />
          </dl>
        );
      })}
    </section>
  );
}

// Period, client and status filters over the loaded lines (BILL-03); the
// client choices are the clients the lines belong to.
function LineFilterBar({
  filters,
  lines,
  locale,
  messages,
  onChange,
}: {
  filters: LineFilters;
  lines: BillableLine[];
  locale: Locale;
  messages: BillingMessages;
  onChange: (update: (filters: LineFilters) => LineFilters) => void;
}) {
  const { filters: labels } = messages;
  const periodOptions = useMemo(
    () =>
      PERIODS.map((period) => ({
        label: labels.periods[period],
        value: period,
      })),
    [labels.periods]
  );
  const clientOptions = useMemo(() => {
    const byId = new Map(lines.map((line) => [line.client.id, line.client]));
    return [
      { label: labels.allClients, value: ALL },
      ...[...byId.values()]
        .map((client) => ({ label: client.name, value: client.id }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    ];
  }, [labels.allClients, lines, locale]);
  const statusOptions = useMemo(
    () => [
      { label: labels.allStatuses, value: ALL },
      ...BILLABLE_LINE_STATUSES.map((status) => ({
        label: messages.statuses[status],
        value: status,
      })),
    ],
    [labels.allStatuses, messages.statuses]
  );
  const handlePeriodChange = useCallback(
    (period: string) => {
      if (isPeriod(period)) {
        onChange((current) => ({ ...current, period }));
      }
    },
    [onChange]
  );
  const handleClientChange = useCallback(
    (clientId: string) => onChange((current) => ({ ...current, clientId })),
    [onChange]
  );
  const handleStatusChange = useCallback(
    (status: string) => {
      if (isStatusFilter(status)) {
        onChange((current) => ({ ...current, status }));
      }
    },
    [onChange]
  );
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <FilterSelect
        label={labels.period}
        onChange={handlePeriodChange}
        options={periodOptions}
        value={filters.period}
      />
      <FilterSelect
        label={labels.client}
        onChange={handleClientChange}
        options={clientOptions}
        value={filters.clientId}
      />
      <FilterSelect
        label={labels.status}
        onChange={handleStatusChange}
        options={statusOptions}
        value={filters.status}
      />
    </div>
  );
}

function FilteredEmpty({
  messages,
  onClear,
}: {
  messages: BillingMessages["filteredEmpty"];
  onClear: () => void;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{messages.title}</EmptyTitle>
        <EmptyDescription>{messages.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onClear} type="button" variant="outline">
          {messages.action}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function EmptyLines({
  messages,
  onAdd,
}: {
  messages: BillingMessages;
  onAdd: () => void;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ReceiptTextIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{messages.empty.title}</EmptyTitle>
        <EmptyDescription>{messages.empty.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAdd} type="button">
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {messages.empty.action}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function LinesLoadError({
  messages,
  onRetry,
}: {
  messages: BillingMessages;
  onRetry: () => void;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlertIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{messages.loadErrorTitle}</EmptyTitle>
        <EmptyDescription>{messages.loadErrorDescription}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry} type="button" variant="outline">
          {messages.retry}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function LinesGrid({
  filters,
  lines,
  locale,
  messages,
  onChange,
}: {
  filters: LineFilters;
  lines: BillableLine[];
  locale: Locale;
  messages: BillingMessages;
  onChange: ChangeStatus;
}) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  // New filters start back on the first page; a status change keeps it.
  const [pagedFilters, setPagedFilters] = useState(filters);
  if (pagedFilters !== filters) {
    setPagedFilters(filters);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }
  const columns = useMemo(
    () => buildColumns(messages, locale, onChange),
    [locale, messages, onChange]
  );
  const i18n = useMemo(
    () => gridI18n(messages.grid, messages.grid.empty),
    [messages.grid]
  );

  const table = useTable({
    columns,
    data: lines,
    features: dataGridFeatures,
    getRowId: (row) => row.id,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    pageCount: Math.max(1, Math.ceil(lines.length / pagination.pageSize)),
    state: { pagination, sorting },
  });

  return (
    <DataGrid
      i18n={i18n}
      recordCount={lines.length}
      table={table}
      tableLayout={{ headerSticky: false }}
    >
      <DataGridScrollArea orientation="horizontal">
        <DataGridTable />
      </DataGridScrollArea>
      <Separator />
      <FrameFooter>
        <DataGridPagination sizes={PAGE_SIZES} />
      </FrameFooter>
    </DataGrid>
  );
}

// The editor's billable lines (BILL-01, E14): flat fees, agreed extra
// rounds and manual fees, which they invoice from their own tool and mark
// exported, then paid (BILL-02).
export function BillingView({
  locale,
  messages,
}: {
  locale: Locale;
  messages: BillingMessages;
}) {
  const { data, isError, refetch } = useQuery(
    orpc.billing.lines.list.queryOptions()
  );
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const [feeOpen, setFeeOpen] = useState(false);
  const openFee = useCallback(() => setFeeOpen(true), []);
  const [filters, setFilters] = useState<LineFilters>(NO_FILTERS);
  const clearFilters = useCallback(() => setFilters(NO_FILTERS), []);
  const shown = useMemo(
    () => filterLines(data ?? [], filters, new Date()),
    [data, filters]
  );

  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<BillableLine | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const { statusChange } = messages;
  const changeStatus = useCallback(
    async (line: BillableLine, status: BillableLineStatus) => {
      try {
        await api.billing.lines.updateStatus({ id: line.id, status });
        toast.success(
          formatMessage(statusChange.changed, {
            label: line.label,
            status: messages.statuses[status],
          })
        );
        return true;
      } catch {
        toast.error(statusChange.error);
        return false;
      } finally {
        // Also refreshes a line another tab marked meanwhile (409), and the
        // dashboard's billable amount.
        await queryClient.invalidateQueries({
          queryKey: orpc.billing.lines.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.project.indicators.queryKey(),
        });
      }
    },
    [messages.statuses, queryClient, statusChange]
  );
  const handleChangeStatus = useCallback(
    (line: BillableLine, status: BillableLineStatus) => {
      if (status === "paid") {
        setPaying(line);
        return;
      }
      changeStatus(line, status);
    },
    [changeStatus]
  );
  const handlePayOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPaying(null);
    }
  }, []);
  const confirmPay = useCallback(async () => {
    if (!paying) {
      return;
    }
    setPayBusy(true);
    if (await changeStatus(paying, "paid")) {
      setPaying(null);
    }
    setPayBusy(false);
  }, [changeStatus, paying]);

  const refetchWorkspace = workspace.refetch;
  const handleRetry = useCallback(
    () => Promise.all([refetch(), refetchWorkspace()]),
    [refetch, refetchWorkspace]
  );
  const currency = workspace.data?.currency;
  const shownIds = useMemo(() => shown.map((line) => line.id), [shown]);

  let summary = messages.description;
  if (data) {
    summary = formatMessage(
      new Intl.PluralRules(locale).select(shown.length) === "one"
        ? messages.countOne
        : messages.countOther,
      { count: shown.length }
    );
  }

  let body = <ClientsSkeleton label={messages.grid.loading} />;
  if (data && currency && data.length === 0) {
    body = <EmptyLines messages={messages} onAdd={openFee} />;
  } else if (data && currency && shown.length === 0) {
    body = (
      <FilteredEmpty messages={messages.filteredEmpty} onClear={clearFilters} />
    );
  } else if (data && currency) {
    body = (
      <LinesGrid
        filters={filters}
        lines={shown}
        locale={locale}
        messages={messages}
        onChange={handleChangeStatus}
      />
    );
  } else if (isError || workspace.isError) {
    body = <LinesLoadError messages={messages} onRetry={handleRetry} />;
  }

  return (
    <>
      <Frame className="w-full" dense spacing="default" variant="default">
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <FrameTitle>
              <h1 className="font-semibold text-base">{messages.title}</h1>
            </FrameTitle>
            <FrameDescription className="text-xs tabular-nums">
              {summary}
            </FrameDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {currency && shown.length > 0 ? (
              <ExportMenu
                ids={shownIds}
                locale={locale}
                messages={messages.export}
              />
            ) : null}
            <Button disabled={!currency} onClick={openFee} type="button">
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {messages.add}
            </Button>
          </div>
        </FrameHeader>
        {data?.length && currency ? (
          <FramePanel className="flex flex-col gap-4">
            <LineFilterBar
              filters={filters}
              lines={data}
              locale={locale}
              messages={messages}
              onChange={setFilters}
            />
            <LineTotals
              currency={currency}
              lines={shown}
              locale={locale}
              messages={messages.totals}
            />
          </FramePanel>
        ) : null}
        <FramePanel className="p-0">{body}</FramePanel>
      </Frame>
      {currency ? (
        <AddFeeDialog
          currency={currency}
          locale={locale}
          messages={messages.fee}
          onOpenChange={setFeeOpen}
          open={feeOpen}
        />
      ) : null}
      <PayDialog
        busy={payBusy}
        line={paying}
        messages={messages}
        onConfirm={confirmPay}
        onOpenChange={handlePayOpenChange}
      />
    </>
  );
}
