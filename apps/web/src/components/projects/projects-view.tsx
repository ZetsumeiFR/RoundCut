"use client";

import type { Locale } from "@roundcut/auth/locale";
import type { ProjectStatus } from "@roundcut/db/project-status";
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
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
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
  FolderKanbanIcon,
  PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { TermsMessages } from "@/components/account/revision-terms-settings";
import { gridI18n } from "@/components/clients/clients-view";
import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { formatTargetDate, type Project, ProjectSheet } from "./project-sheet";

type ProjectsMessages = Messages["projects"];
type ProjectColumn = Column<DataGridFeatures, Project, unknown>;
type BadgeVariant =
  | "outline"
  | "info-light"
  | "warning-light"
  | "success-light"
  | "secondary";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [DEFAULT_PAGE_SIZE, 25, 50];
const SKELETON_ROWS = ["first", "second", "third", "fourth", "fifth"];
const CENTS_PER_UNIT = 100;

const STATUS_BADGES: Record<ProjectStatus, BadgeVariant> = {
  approved: "success-light",
  archived: "secondary",
  awaiting_client: "warning-light",
  draft: "outline",
  in_progress: "info-light",
};

const countLabel = (
  messages: ProjectsMessages,
  locale: Locale,
  count: number
) =>
  formatMessage(
    new Intl.PluralRules(locale).select(count) === "one"
      ? messages.countOne
      : messages.countOther,
    { count }
  );

function SortableHeader({ column }: { column: ProjectColumn }) {
  return <DataGridColumnHeader column={column} />;
}

function TextCell({ muted, value }: { muted?: boolean; value: string }) {
  return (
    <span
      className={muted ? "text-muted-foreground text-sm" : "truncate text-sm"}
    >
      {value}
    </span>
  );
}

const numericMeta = (headerTitle: string) => ({
  cellClassName: "text-end",
  headerClassName: "text-end [&>div]:w-full [&>div]:justify-end",
  headerTitle,
});

function buildColumns(
  messages: ProjectsMessages,
  locale: Locale,
  formatAmount: (cents: number) => string
): ColumnDef<DataGridFeatures, Project>[] {
  const { columns } = messages;
  return [
    {
      accessorFn: (project) => project.name.toLocaleLowerCase(),
      cell: ({ row }) => (
        <span className="block truncate font-medium text-sm">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "project",
      meta: { headerTitle: columns.project },
      minSize: 180,
      size: 240,
    },
    {
      accessorFn: (project) => project.client.name.toLocaleLowerCase(),
      cell: ({ row }) => <TextCell value={row.original.client.name} />,
      header: ({ column }) => <SortableHeader column={column} />,
      id: "client",
      meta: { headerTitle: columns.client },
      size: 200,
    },
    {
      accessorFn: (project) => project.targetDate ?? "",
      cell: ({ row }) => {
        const { targetDate } = row.original;
        return targetDate ? (
          <TextCell value={formatTargetDate(targetDate, locale)} />
        ) : (
          <TextCell muted value={messages.none} />
        );
      },
      header: ({ column }) => <SortableHeader column={column} />,
      id: "targetDate",
      meta: { headerTitle: columns.targetDate },
      size: 150,
    },
    {
      accessorFn: (project) => project.status,
      cell: ({ row }) => (
        <Badge size="lg" variant={STATUS_BADGES[row.original.status]}>
          {messages.status[row.original.status]}
        </Badge>
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "status",
      meta: { headerTitle: columns.status },
      size: 150,
    },
    {
      accessorFn: (project) => project.termsSnapshot.includedRounds,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.termsSnapshot.includedRounds}
        </span>
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "includedRounds",
      meta: numericMeta(columns.includedRounds),
      size: 150,
    },
    {
      accessorFn: (project) => project.flatFeeCents ?? -1,
      cell: ({ row }) => {
        const { flatFeeCents } = row.original;
        return flatFeeCents === null ? (
          <TextCell muted value={messages.none} />
        ) : (
          <span className="text-sm tabular-nums">
            {formatAmount(flatFeeCents)}
          </span>
        );
      },
      header: ({ column }) => <SortableHeader column={column} />,
      id: "flatFee",
      meta: numericMeta(columns.flatFee),
      size: 140,
    },
  ];
}

export function ProjectsSkeleton({ label }: { label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col" role="status">
      {SKELETON_ROWS.map((row) => (
        <div
          className="flex h-12 items-center gap-6 border-b px-4 last:border-b-0"
          key={row}
        >
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-3.5 w-28 max-sm:hidden" />
          <Skeleton className="h-3.5 w-24 max-md:hidden" />
          <Skeleton className="ml-auto h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

function ProjectsEmpty({
  action,
  description,
  icon,
  title,
}: {
  action: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{action}</EmptyContent>
    </Empty>
  );
}

function ProjectsGrid({
  currency,
  locale,
  messages,
  projects,
}: {
  currency: string;
  locale: Locale;
  messages: ProjectsMessages;
  projects: Project[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const columns = useMemo(() => {
    const amount = new Intl.NumberFormat(locale, {
      currency,
      style: "currency",
    });
    return buildColumns(messages, locale, (cents) =>
      amount.format(cents / CENTS_PER_UNIT)
    );
  }, [currency, locale, messages]);
  const i18n = useMemo(
    () => gridI18n(messages.grid, messages.grid.empty),
    [messages.grid]
  );

  const table = useTable({
    columns,
    data: projects,
    features: dataGridFeatures,
    getRowId: (row) => row.id,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: { pagination, sorting },
  });

  return (
    <DataGrid
      i18n={i18n}
      recordCount={projects.length}
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

export function ProjectsView({
  locale,
  messages,
  terms,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  terms: TermsMessages;
}) {
  const projects = useQuery(orpc.project.list.queryOptions());
  const clients = useQuery(orpc.client.list.queryOptions());
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const [sheetOpen, setSheetOpen] = useState(false);
  const openCreate = useCallback(() => setSheetOpen(true), []);

  const queries = [projects, clients, workspace];
  const isError = queries.some((query) => query.isError);
  const refetchProjects = projects.refetch;
  const refetchClients = clients.refetch;
  const refetchWorkspace = workspace.refetch;
  const handleRetry = useCallback(
    () =>
      Promise.all([refetchProjects(), refetchClients(), refetchWorkspace()]),
    [refetchClients, refetchProjects, refetchWorkspace]
  );

  const ready = projects.data && clients.data && workspace.data;
  const canCreate = Boolean(clients.data?.length && workspace.data);

  let body = <ProjectsSkeleton label={messages.grid.loading} />;
  if (isError) {
    body = (
      <ProjectsEmpty
        action={
          <Button onClick={handleRetry} type="button" variant="outline">
            {messages.retry}
          </Button>
        }
        description={messages.loadErrorDescription}
        icon={<CircleAlertIcon aria-hidden="true" />}
        title={messages.loadErrorTitle}
      />
    );
  } else if (ready && projects.data.length > 0) {
    body = (
      <ProjectsGrid
        currency={workspace.data.currency}
        locale={locale}
        messages={messages}
        projects={projects.data}
      />
    );
  } else if (ready && !canCreate) {
    body = (
      <ProjectsEmpty
        action={
          <Button nativeButton={false} render={<Link href="/clients" />}>
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {messages.noClients.action}
          </Button>
        }
        description={messages.noClients.description}
        icon={<BuildingIcon aria-hidden="true" />}
        title={messages.noClients.title}
      />
    );
  } else if (ready) {
    body = (
      <ProjectsEmpty
        action={
          <Button onClick={openCreate} type="button">
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {messages.empty.action}
          </Button>
        }
        description={messages.empty.description}
        icon={<FolderKanbanIcon aria-hidden="true" />}
        title={messages.empty.title}
      />
    );
  }

  const summary = projects.data
    ? countLabel(messages, locale, projects.data.length)
    : messages.description;

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
            disabled={!canCreate}
            onClick={openCreate}
            type="button"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {messages.add}
          </Button>
        </FrameHeader>
        <FramePanel className="p-0">{body}</FramePanel>
      </Frame>
      {clients.data && workspace.data ? (
        <ProjectSheet
          clients={clients.data}
          locale={locale}
          messages={messages}
          onOpenChange={setSheetOpen}
          open={sheetOpen}
          terms={terms}
          workspace={workspace.data}
        />
      ) : null}
    </>
  );
}
