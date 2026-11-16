"use client";

import type { Locale } from "@roundcut/auth/locale";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@roundcut/ui/components/input-group";
import {
  DataGrid,
  type DataGridFeatures,
  dataGridFeatures,
} from "@roundcut/ui/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@roundcut/ui/components/reui/data-grid/data-grid-column-header";
import type { DataGridI18nOverrides } from "@roundcut/ui/components/reui/data-grid/data-grid-i18n";
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
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import {
  BuildingIcon,
  CircleAlertIcon,
  EllipsisIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import type { TermsMessages } from "@/components/account/revision-terms-settings";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import {
  type Client,
  ClientSheet,
  type ClientSheetState,
  formatSiren,
} from "./client-sheet";

type ClientsMessages = Messages["clients"];
type ClientColumn = Column<DataGridFeatures, Client, unknown>;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [DEFAULT_PAGE_SIZE, 25, 50];
const SKELETON_ROWS = ["first", "second", "third", "fourth", "fifth"];
const DEFAULT_SORTING: SortingState = [{ desc: false, id: "client" }];
const CENTS_PER_UNIT = 100;
const DIACRITICS = /\p{Diacritic}/gu;

// Case- and accent-insensitive, so "lea" finds "Léa".
const normalizeSearch = (value: string) =>
  value.normalize("NFD").replace(DIACRITICS, "").toLocaleLowerCase().trim();

const searchableText = (client: Client) =>
  normalizeSearch(
    [
      client.name,
      client.deciderName,
      client.deciderEmail,
      client.siren ?? "",
      ...client.reviewerEmails,
    ].join(" ")
  );

interface ClientActions {
  messages: ClientsMessages;
  openEdit: (client: Client) => void;
  openView: (client: Client) => void;
  requestArchive: (client: Client) => void;
}

const ClientActionsContext = createContext<ClientActions | null>(null);

function useClientActions() {
  const actions = use(ClientActionsContext);
  if (!actions) {
    throw new Error("Client cells must render inside ClientsView");
  }
  return actions;
}

const countLabel = (messages: ClientsMessages, locale: Locale, count: number) =>
  formatMessage(
    new Intl.PluralRules(locale).select(count) === "one"
      ? messages.countOne
      : messages.countOther,
    { count }
  );

function SortableHeader({ column }: { column: ClientColumn }) {
  return <DataGridColumnHeader column={column} />;
}

function ClientNameCell({ client }: { client: Client }) {
  const { messages, openView } = useClientActions();
  const handleClick = useCallback(() => openView(client), [client, openView]);

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <button
        aria-label={`${messages.view} · ${client.name}`}
        className="w-fit max-w-full truncate text-left font-medium text-sm underline-offset-4 transition-colors hover:underline"
        onClick={handleClick}
        type="button"
      >
        {client.name}
      </button>
      {client.siren ? (
        <span className="truncate text-muted-foreground text-xs tabular-nums">
          SIREN {formatSiren(client.siren)}
        </span>
      ) : null}
    </div>
  );
}

function DeciderCell({ client }: { client: Client }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm">{client.deciderName}</span>
      <span className="truncate text-muted-foreground text-xs">
        {client.deciderEmail}
      </span>
    </div>
  );
}

function CounterCell({ value }: { value: string | number }) {
  return <span className="text-sm tabular-nums">{value}</span>;
}

function ActionsCell({ client }: { client: Client }) {
  const { messages, openEdit, openView, requestArchive } = useClientActions();
  const handleView = useCallback(() => openView(client), [client, openView]);
  const handleEdit = useCallback(() => openEdit(client), [client, openEdit]);
  const handleArchive = useCallback(
    () => requestArchive(client),
    [client, requestArchive]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={formatMessage(messages.actions, { name: client.name })}
        render={<Button size="icon-sm" variant="ghost" />}
      >
        <EllipsisIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleView}>
            {messages.view}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleEdit}>
            {messages.edit}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleArchive} variant="destructive">
          {messages.archive.action}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const numericMeta = (headerTitle: string) => ({
  cellClassName: "text-end",
  headerClassName: "text-end [&>div]:w-full [&>div]:justify-end",
  headerTitle,
});

function buildColumns(
  messages: ClientsMessages,
  formatAmount: (cents: number) => string
): ColumnDef<DataGridFeatures, Client>[] {
  const { columns } = messages;
  return [
    {
      accessorFn: (client) => client.name.toLocaleLowerCase(),
      cell: ({ row }) => <ClientNameCell client={row.original} />,
      header: ({ column }) => <SortableHeader column={column} />,
      id: "client",
      meta: { headerTitle: columns.client },
      minSize: 180,
      size: 240,
    },
    {
      accessorFn: (client) => client.deciderName.toLocaleLowerCase(),
      cell: ({ row }) => <DeciderCell client={row.original} />,
      header: ({ column }) => <SortableHeader column={column} />,
      id: "decider",
      meta: { headerTitle: columns.decider },
      size: 240,
    },
    {
      accessorFn: (client) => client.activeProjects,
      cell: ({ row }) => <CounterCell value={row.original.activeProjects} />,
      header: ({ column }) => <SortableHeader column={column} />,
      id: "activeProjects",
      meta: numericMeta(columns.activeProjects),
      size: 150,
    },
    {
      accessorFn: (client) => client.acceptedExtraRounds,
      cell: ({ row }) => (
        <CounterCell value={row.original.acceptedExtraRounds} />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "extraRounds",
      meta: numericMeta(columns.extraRounds),
      size: 170,
    },
    {
      accessorFn: (client) => client.acceptedExtraRoundsAmountCents,
      cell: ({ row }) => (
        <CounterCell
          value={formatAmount(row.original.acceptedExtraRoundsAmountCents)}
        />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "amount",
      meta: numericMeta(columns.amount),
      size: 140,
    },
    {
      cell: ({ row }) => <ActionsCell client={row.original} />,
      enableSorting: false,
      header: () => <span className="sr-only">{messages.view}</span>,
      id: "actions",
      meta: { cellClassName: "text-end", headerClassName: "text-end" },
      size: 56,
    },
  ];
}

export function gridI18n(
  grid: ClientsMessages["grid"],
  empty: string
): DataGridI18nOverrides {
  return {
    labels: {
      empty,
      goToPage: (page) => formatMessage(grid.goToPage, { page }),
      loading: grid.loading,
      nextPage: grid.nextPage,
      paginationInfo: ({ count, from, to }) =>
        formatMessage(grid.paginationInfo, { count, from, to }),
      previousPage: grid.previousPage,
      rowsPerPage: grid.rowsPerPage,
      sortAscending: grid.sortAscending,
      sortDescending: grid.sortDescending,
    },
  };
}

export function ClientsSkeleton({ label }: { label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col" role="status">
      {SKELETON_ROWS.map((row) => (
        <div
          className="flex h-14 items-center gap-6 border-b px-4 last:border-b-0"
          key={row}
        >
          <Skeleton className="h-3.5 w-40" />
          <div className="flex flex-col gap-1.5 max-sm:hidden">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-3.5 w-32 max-md:hidden" />
          <Skeleton className="ml-auto size-6" />
        </div>
      ))}
    </div>
  );
}

function EmptyClients({
  messages,
  onAdd,
}: {
  messages: ClientsMessages;
  onAdd: () => void;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BuildingIcon aria-hidden="true" />
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

function ClientsLoadError({
  messages,
  onRetry,
}: {
  messages: ClientsMessages;
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

function ArchiveDialog({
  busy,
  client,
  messages,
  onConfirm,
  onOpenChange,
}: {
  busy: boolean;
  client: Client | null;
  messages: ClientsMessages;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={client !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{messages.archive.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {formatMessage(messages.archive.description, {
              name: client?.name ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{messages.cancel}</AlertDialogCancel>
          <Button disabled={busy} onClick={onConfirm} variant="destructive">
            {busy ? messages.archive.archiving : messages.archive.action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ClientsSearch({
  messages,
  onChange,
  value,
}: {
  messages: ClientsMessages["search"];
  onChange: (value: string) => void;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );
  const handleClear = useCallback(() => onChange(""), [onChange]);

  return (
    <InputGroup className="sm:max-w-xs">
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={messages.label}
        className="[&::-webkit-search-cancel-button]:appearance-none"
        onChange={handleChange}
        placeholder={messages.placeholder}
        type="search"
        value={value}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={messages.clear}
            onClick={handleClear}
            size="icon-xs"
          >
            <XIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

function ClientsGrid({
  clients,
  currency,
  locale,
  messages,
}: {
  clients: Client[];
  currency: string;
  locale: Locale;
  messages: ClientsMessages;
}) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const columns = useMemo(() => {
    const amount = new Intl.NumberFormat(locale, {
      currency,
      style: "currency",
    });
    return buildColumns(messages, (cents) =>
      amount.format(cents / CENTS_PER_UNIT)
    );
  }, [currency, locale, messages]);

  const indexed = useMemo(
    () => clients.map((client) => ({ client, text: searchableText(client) })),
    [clients]
  );
  const query = normalizeSearch(search);
  const visibleClients = useMemo(
    () =>
      query
        ? indexed
            .filter(({ text }) => text.includes(query))
            .map(({ client }) => client)
        : clients,
    [clients, indexed, query]
  );

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, []);

  const empty = query
    ? formatMessage(messages.search.noResults, { query: search.trim() })
    : messages.grid.empty;
  const i18n = useMemo(
    () => gridI18n(messages.grid, empty),
    [empty, messages.grid]
  );

  const pageCount = Math.max(
    1,
    Math.ceil(visibleClients.length / pagination.pageSize)
  );
  // Archiving the last client of the last page would strand the page index.
  const safePagination =
    pagination.pageIndex < pageCount
      ? pagination
      : { ...pagination, pageIndex: pageCount - 1 };

  const table = useTable({
    autoResetPageIndex: false,
    columns,
    data: visibleClients,
    features: dataGridFeatures,
    getRowId: (row) => row.id,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    pageCount,
    state: { pagination: safePagination, sorting },
  });

  return (
    <DataGrid
      i18n={i18n}
      recordCount={visibleClients.length}
      table={table}
      tableLayout={{ headerSticky: false }}
    >
      <div className="border-b p-3">
        <ClientsSearch
          messages={messages.search}
          onChange={handleSearch}
          value={search}
        />
      </div>
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

export function ClientsView({
  locale,
  messages,
  terms,
}: {
  locale: Locale;
  messages: ClientsMessages;
  terms: TermsMessages;
}) {
  const queryClient = useQueryClient();
  const { data, isError, refetch } = useQuery(orpc.client.list.queryOptions());
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetState, setSheetState] = useState<ClientSheetState | null>(null);
  const [archiving, setArchiving] = useState<Client | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const openSheet = useCallback((state: ClientSheetState) => {
    setSheetState(state);
    setSheetOpen(true);
  }, []);

  const openCreate = useCallback(
    () => openSheet({ mode: "create" }),
    [openSheet]
  );

  const actions = useMemo<ClientActions>(
    () => ({
      messages,
      openEdit: (client) =>
        openSheet({ clientId: client.id, fromView: false, mode: "edit" }),
      openView: (client) => openSheet({ clientId: client.id, mode: "view" }),
      requestArchive: setArchiving,
    }),
    [messages, openSheet]
  );

  const handleArchiveOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setArchiving(null);
    }
  }, []);

  const confirmArchive = useCallback(async () => {
    if (!archiving) {
      return;
    }
    setArchiveBusy(true);
    try {
      await api.client.archive({ id: archiving.id });
      await queryClient.invalidateQueries({
        queryKey: orpc.client.list.queryKey(),
      });
      toast.success(
        formatMessage(messages.archive.archived, { name: archiving.name })
      );
      if (
        sheetState?.mode !== "create" &&
        sheetState?.clientId === archiving.id
      ) {
        setSheetOpen(false);
      }
      setArchiving(null);
    } catch {
      toast.error(messages.actionError);
    } finally {
      setArchiveBusy(false);
    }
  }, [archiving, messages, queryClient, sheetState]);

  const refetchWorkspace = workspace.refetch;
  const handleRetry = useCallback(
    () => Promise.all([refetch(), refetchWorkspace()]),
    [refetch, refetchWorkspace]
  );
  const currency = workspace.data?.currency;

  let summary = messages.description;
  if (data) {
    summary = countLabel(messages, locale, data.length);
  }

  let body = <ClientsSkeleton label={messages.grid.loading} />;
  // New clients start from the workspace plan terms, so adding one waits for
  // the workspace too.
  if (data && currency && data.length === 0) {
    body = <EmptyClients messages={messages} onAdd={openCreate} />;
  } else if (data && currency) {
    body = (
      <ClientsGrid
        clients={data}
        currency={currency}
        locale={locale}
        messages={messages}
      />
    );
  } else if (isError || workspace.isError) {
    body = <ClientsLoadError messages={messages} onRetry={handleRetry} />;
  }

  return (
    <ClientActionsContext value={actions}>
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
            disabled={!workspace.data}
            onClick={openCreate}
            type="button"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {messages.add}
          </Button>
        </FrameHeader>
        <FramePanel className="p-0">{body}</FramePanel>
      </Frame>
      <ClientSheet
        clients={data ?? []}
        locale={locale}
        messages={messages}
        onArchive={setArchiving}
        onOpenChange={setSheetOpen}
        onStateChange={setSheetState}
        open={sheetOpen}
        state={sheetState}
        terms={terms}
        workspace={workspace.data}
      />
      <ArchiveDialog
        busy={archiveBusy}
        client={archiving}
        messages={messages}
        onConfirm={confirmArchive}
        onOpenChange={handleArchiveOpenChange}
      />
    </ClientActionsContext>
  );
}
