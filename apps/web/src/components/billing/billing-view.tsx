"use client";

import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import type {
  BillableLineSource,
  BillableLineStatus,
} from "@roundcut/db/billing";
import { Button } from "@roundcut/ui/components/button";
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
import { useQuery } from "@tanstack/react-query";
import {
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { CircleAlertIcon, PlusIcon, ReceiptTextIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ClientsSkeleton, gridI18n } from "@/components/clients/clients-view";
import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { AddFeeDialog } from "./add-fee-dialog";

type BillingMessages = Messages["billing"];
type BillableLine = Awaited<
  ReturnType<AppRouterClient["billing"]["lines"]["list"]>
>[number];
type LineColumn = Column<DataGridFeatures, BillableLine, unknown>;

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

const numericMeta = (headerTitle: string) => ({
  cellClassName: "text-end",
  headerClassName: "text-end [&>div]:w-full [&>div]:justify-end",
  headerTitle,
});

function buildColumns(
  messages: BillingMessages,
  locale: Locale
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
        <Badge variant={STATUS_BADGES[row.original.status]}>
          {messages.statuses[row.original.status]}
        </Badge>
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "status",
      meta: { headerTitle: columns.status },
      size: 120,
    },
  ];
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
  lines,
  locale,
  messages,
}: {
  lines: BillableLine[];
  locale: Locale;
  messages: BillingMessages;
}) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const columns = useMemo(
    () => buildColumns(messages, locale),
    [locale, messages]
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
// rounds and manual fees, which they invoice from their own tool.
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

  const refetchWorkspace = workspace.refetch;
  const handleRetry = useCallback(
    () => Promise.all([refetch(), refetchWorkspace()]),
    [refetch, refetchWorkspace]
  );
  const currency = workspace.data?.currency;

  let summary = messages.description;
  if (data) {
    summary = formatMessage(
      new Intl.PluralRules(locale).select(data.length) === "one"
        ? messages.countOne
        : messages.countOther,
      { count: data.length }
    );
  }

  let body = <ClientsSkeleton label={messages.grid.loading} />;
  if (data && currency && data.length === 0) {
    body = <EmptyLines messages={messages} onAdd={openFee} />;
  } else if (data && currency) {
    body = <LinesGrid lines={data} locale={locale} messages={messages} />;
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
          <Button
            className="shrink-0"
            disabled={!currency}
            onClick={openFee}
            type="button"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {messages.add}
          </Button>
        </FrameHeader>
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
    </>
  );
}
