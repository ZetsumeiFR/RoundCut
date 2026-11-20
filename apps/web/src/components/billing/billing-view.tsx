"use client";

import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import {
  BILLABLE_LINE_STATUS_TRANSITIONS,
  type BillableLineSource,
  type BillableLineStatus,
} from "@roundcut/db/billing";
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
  PlusIcon,
  ReceiptTextIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ClientsSkeleton, gridI18n } from "@/components/clients/clients-view";
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
  onChange,
}: {
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
    body = (
      <LinesGrid
        lines={data}
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
