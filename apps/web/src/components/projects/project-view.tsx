"use client";

import { ORPCError } from "@orpc/client";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import type { DeliverableStatus } from "@roundcut/db/deliverable";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@roundcut/ui/components/breadcrumb";
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
import { DataGridScrollArea } from "@roundcut/ui/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@roundcut/ui/components/reui/data-grid/data-grid-table";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@roundcut/ui/components/reui/frame";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@roundcut/ui/components/tabs";
import { cn } from "@roundcut/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  type Column,
  type ColumnDef,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import {
  CircleAlertIcon,
  ClapperboardIcon,
  CopyIcon,
  FolderIcon,
  HistoryIcon,
  PlusIcon,
  SearchXIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  RevisionTermsList,
  type TermsMessages,
} from "@/components/account/revision-terms-settings";
import { gridI18n } from "@/components/clients/clients-view";
import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { deliverableCountLabel, formatDuration } from "./deliverable-form";
import { DeliverablesSheet } from "./deliverables-sheet";
import { DuplicateProjectDialog } from "./duplicate-project-dialog";
import { formatTargetDate } from "./project-sheet";
import { STATUS_BADGES } from "./projects-view";
import { type UploadTarget, VersionUploadSheet } from "./version-upload-sheet";

type ProjectsMessages = Messages["projects"];
type ViewMessages = ProjectsMessages["view"];
type ProjectDetails = Awaited<ReturnType<AppRouterClient["project"]["get"]>>;
type DeliverableRow = ProjectDetails["deliverables"][number];
type DeliverableColumn = Column<DataGridFeatures, DeliverableRow, unknown>;

const MAX_RETRIES = 3;
const CENTS_PER_UNIT = 100;
const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SKELETON_ROWS = ["first", "second", "third"];

const DELIVERABLE_BADGES: Record<
  DeliverableStatus,
  "outline" | "info-light" | "success-light"
> = {
  approved: "success-light",
  draft: "outline",
  in_review: "info-light",
};

const isNotFound = (error: unknown) =>
  error instanceof ORPCError && error.code === "NOT_FOUND";

function SortableHeader({ column }: { column: DeliverableColumn }) {
  return <DataGridColumnHeader column={column} />;
}

function DeliverableCell({
  deliverable,
  messages,
}: {
  deliverable: DeliverableRow;
  messages: ProjectsMessages["deliverables"];
}) {
  const { aspect, targetDurationSeconds, title } = deliverable;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium text-sm">{title}</span>
      <span className="truncate text-muted-foreground text-xs">
        {messages.aspects[aspect]}
        {targetDurationSeconds === null
          ? null
          : ` · ${formatDuration(targetDurationSeconds)}`}
      </span>
    </div>
  );
}
function RoundCell({
  current,
  included,
  messages,
}: {
  current: number;
  included: number;
  messages: ViewMessages;
}) {
  const ratio = included > 0 ? Math.min(current / included, 1) : 1;
  const exhausted = current >= included;
  return (
    <div
      aria-label={formatMessage(messages.roundLabel, { current, included })}
      className="flex items-center gap-2"
      role="img"
    >
      <svg aria-hidden="true" className="size-6 -rotate-90" viewBox="0 0 24 24">
        <circle
          className="stroke-muted-foreground/20"
          cx="12"
          cy="12"
          fill="none"
          r={RING_RADIUS}
          strokeWidth="3"
        />
        {current > 0 ? (
          <circle
            className={cn(exhausted ? "stroke-warning" : "stroke-primary")}
            cx="12"
            cy="12"
            fill="none"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
            strokeLinecap="round"
            strokeWidth="3"
          />
        ) : null}
      </svg>
      <span className="text-sm tabular-nums">
        {formatMessage(messages.round, { current, included })}
      </span>
    </div>
  );
}

function UploadCell({
  deliverable,
  label,
  onUpload,
}: {
  deliverable: DeliverableRow;
  label: string;
  onUpload: (deliverable: UploadTarget) => void;
}) {
  const handleClick = useCallback(
    () => onUpload({ id: deliverable.id, title: deliverable.title }),
    [deliverable.id, deliverable.title, onUpload]
  );
  return (
    <Button
      aria-label={formatMessage(label, { title: deliverable.title })}
      onClick={handleClick}
      size="icon-sm"
      type="button"
      variant="outline"
    >
      <UploadIcon aria-hidden="true" />
    </Button>
  );
}

function buildColumns(
  messages: ProjectsMessages,
  includedRounds: number,
  onUpload: (deliverable: UploadTarget) => void
): ColumnDef<DataGridFeatures, DeliverableRow>[] {
  const { view } = messages;
  return [
    {
      accessorFn: (deliverable) => deliverable.position,
      cell: ({ row }) => (
        <DeliverableCell
          deliverable={row.original}
          messages={messages.deliverables}
        />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "deliverable",
      meta: { headerTitle: view.columns.deliverable },
      minSize: 200,
      size: 280,
    },
    {
      accessorFn: (deliverable) =>
        deliverable.review.latestVersion?.number ?? 0,
      cell: ({ row }) => {
        const version = row.original.review.latestVersion;
        return version ? (
          <span className="text-sm tabular-nums">
            {formatMessage(view.version, { number: version.number })}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">
            {view.noVersion}
          </span>
        );
      },
      header: ({ column }) => <SortableHeader column={column} />,
      id: "version",
      meta: { headerTitle: view.columns.version },
      size: 160,
    },
    {
      accessorFn: (deliverable) => deliverable.review.currentRound?.number ?? 0,
      cell: ({ row }) => (
        <RoundCell
          current={row.original.review.currentRound?.number ?? 0}
          included={includedRounds}
          messages={view}
        />
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "round",
      meta: { headerTitle: view.columns.round },
      size: 140,
    },
    {
      accessorFn: (deliverable) => deliverable.review.openComments,
      cell: ({ row }) => {
        const count = row.original.review.openComments;
        return (
          <Badge
            aria-label={formatMessage(view.openCommentsLabel, { count })}
            variant={count > 0 ? "warning-light" : "outline"}
          >
            {count}
          </Badge>
        );
      },
      header: ({ column }) => <SortableHeader column={column} />,
      id: "openComments",
      meta: { headerTitle: view.columns.openComments },
      size: 150,
    },
    {
      accessorFn: (deliverable) => deliverable.status,
      cell: ({ row }) => (
        <Badge size="lg" variant={DELIVERABLE_BADGES[row.original.status]}>
          {view.deliverableStatus[row.original.status]}
        </Badge>
      ),
      header: ({ column }) => <SortableHeader column={column} />,
      id: "status",
      meta: { headerTitle: view.columns.status },
      size: 130,
    },
    {
      cell: ({ row }) => (
        <UploadCell
          deliverable={row.original}
          label={view.upload}
          onUpload={onUpload}
        />
      ),
      enableSorting: false,
      header: () => <span className="sr-only">{view.columns.actions}</span>,
      id: "actions",
      size: 64,
    },
  ];
}

function DeliverablesGrid({
  messages,
  onUpload,
  project,
}: {
  messages: ProjectsMessages;
  onUpload: (deliverable: UploadTarget) => void;
  project: ProjectDetails;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { includedRounds } = project.termsSnapshot;
  const columns = useMemo(
    () => buildColumns(messages, includedRounds, onUpload),
    [includedRounds, messages, onUpload]
  );
  const i18n = useMemo(
    () => gridI18n(messages.grid, messages.deliverables.emptyTitle),
    [messages.deliverables.emptyTitle, messages.grid]
  );
  const table = useTable({
    columns,
    data: project.deliverables,
    features: dataGridFeatures,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <DataGrid
      i18n={i18n}
      recordCount={project.deliverables.length}
      table={table}
      tableLayout={{ headerSticky: false }}
    >
      <DataGridScrollArea orientation="horizontal">
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
}

function ViewEmpty({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

function DeliverablesTab({
  locale,
  messages,
  onAdd,
  onUpload,
  project,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  onAdd: () => void;
  onUpload: (deliverable: UploadTarget) => void;
  project: ProjectDetails;
}) {
  const { deliverables } = messages;
  return (
    <Frame className="w-full" dense spacing="default" variant="default">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <FrameTitle>
            <h2 className="font-semibold text-sm">
              {messages.view.tabs.deliverables}
            </h2>
          </FrameTitle>
          <FrameDescription className="text-xs tabular-nums">
            {deliverableCountLabel(
              deliverables,
              locale,
              project.deliverables.length
            )}
          </FrameDescription>
        </div>
        <Button className="shrink-0" onClick={onAdd} type="button">
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {deliverables.add}
        </Button>
      </FrameHeader>
      <FramePanel className="p-0">
        {project.deliverables.length > 0 ? (
          <DeliverablesGrid
            messages={messages}
            onUpload={onUpload}
            project={project}
          />
        ) : (
          <ViewEmpty
            action={
              <Button onClick={onAdd} type="button" variant="outline">
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                {deliverables.add}
              </Button>
            }
            description={deliverables.emptyDescription}
            icon={<ClapperboardIcon aria-hidden="true" />}
            title={deliverables.emptyTitle}
          />
        )}
      </FramePanel>
    </Frame>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function SettingsTab({
  currency,
  locale,
  messages,
  project,
  terms,
}: {
  currency: string;
  locale: Locale;
  messages: ProjectsMessages;
  project: ProjectDetails;
  terms: TermsMessages;
}) {
  const { settings } = messages.view;
  const amount = new Intl.NumberFormat(locale, { currency, style: "currency" });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Frame className="w-full" spacing="default" variant="default">
        <FrameHeader>
          <FrameTitle>
            <h2 className="font-semibold text-sm">{settings.details}</h2>
          </FrameTitle>
        </FrameHeader>
        <FramePanel>
          <dl className="flex flex-col gap-2 text-sm">
            <DetailRow label={settings.client} value={project.client.name} />
            <DetailRow
              label={settings.targetDate}
              value={
                project.targetDate
                  ? formatTargetDate(project.targetDate, locale)
                  : messages.none
              }
            />
            <DetailRow
              label={settings.flatFee}
              value={
                project.flatFeeCents === null
                  ? messages.none
                  : amount.format(project.flatFeeCents / CENTS_PER_UNIT)
              }
            />
            <DetailRow
              label={settings.createdAt}
              value={new Intl.DateTimeFormat(locale, {
                dateStyle: "long",
              }).format(new Date(project.createdAt))}
            />
          </dl>
        </FramePanel>
      </Frame>
      <Frame className="w-full" spacing="default" variant="default">
        <FrameHeader>
          <FrameTitle>
            <h2 className="font-semibold text-sm">{settings.terms}</h2>
          </FrameTitle>
          <FrameDescription className="text-xs">
            {settings.description}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="text-sm">
          <RevisionTermsList
            currency={currency}
            labels={settings}
            locale={locale}
            messages={terms}
            terms={project.termsSnapshot}
          />
        </FramePanel>
      </Frame>
    </div>
  );
}

function ProjectHeader({
  locale,
  messages,
  onDuplicate,
  project,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  onDuplicate: () => void;
  project: ProjectDetails;
}) {
  return (
    <header className="flex flex-col gap-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="flex items-center gap-1"
              render={<Link href="/projects" />}
            >
              <FolderIcon aria-hidden="true" className="size-3.5" />
              {messages.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 break-words font-semibold text-lg">
          {project.name}
        </h1>
        <Badge size="lg" variant={STATUS_BADGES[project.status]}>
          {messages.status[project.status]}
        </Badge>
        <Button
          className="ms-auto"
          onClick={onDuplicate}
          type="button"
          variant="outline"
        >
          <CopyIcon aria-hidden="true" data-icon="inline-start" />
          {messages.duplicate.action}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {project.client.name}
        {project.targetDate
          ? ` · ${formatTargetDate(project.targetDate, locale)}`
          : null}
      </p>
    </header>
  );
}

export function ProjectViewSkeleton({ label }: { label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col gap-6" role="status">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <Skeleton className="h-8 w-72 max-w-full" />
      <div className="flex flex-col border">
        {SKELETON_ROWS.map((row) => (
          <div
            className="flex h-14 items-center gap-6 border-b px-4 last:border-b-0"
            key={row}
          >
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3.5 w-24 max-sm:hidden" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectView({
  locale,
  messages,
  projectId,
  terms,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  projectId: string;
  terms: TermsMessages;
}) {
  const project = useQuery(
    orpc.project.get.queryOptions({
      input: { id: projectId },
      meta: { inlineError: true },
      // A missing project stays missing: show it at once.
      retry: (failures, error) => !isNotFound(error) && failures < MAX_RETRIES,
    })
  );
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);
  const openDeliverables = useCallback(() => setDeliverablesOpen(true), []);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const openDuplicate = useCallback(() => setDuplicateOpen(true), []);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>();
  const closeUpload = useCallback((open: boolean) => {
    if (!open) {
      setUploadTarget(undefined);
    }
  }, []);
  const { view } = messages;

  const refetchProject = project.refetch;
  const refetchWorkspace = workspace.refetch;
  const handleRetry = useCallback(
    () => Promise.all([refetchProject(), refetchWorkspace()]),
    [refetchProject, refetchWorkspace]
  );

  if (isNotFound(project.error)) {
    return (
      <ViewEmpty
        action={
          <Button nativeButton={false} render={<Link href="/projects" />}>
            {view.notFound.action}
          </Button>
        }
        description={view.notFound.description}
        icon={<SearchXIcon aria-hidden="true" />}
        title={view.notFound.title}
      />
    );
  }
  if (project.isError || workspace.isError) {
    return (
      <ViewEmpty
        action={
          <Button onClick={handleRetry} type="button" variant="outline">
            {messages.retry}
          </Button>
        }
        description={messages.loadErrorDescription}
        icon={<CircleAlertIcon aria-hidden="true" />}
        title={view.loadErrorTitle}
      />
    );
  }
  if (!(project.data && workspace.data)) {
    return <ProjectViewSkeleton label={view.loading} />;
  }

  return (
    <>
      <ProjectHeader
        locale={locale}
        messages={messages}
        onDuplicate={openDuplicate}
        project={project.data}
      />
      <Tabs defaultValue="deliverables">
        <TabsList aria-label={view.tabs.label} variant="line">
          <TabsTrigger value="deliverables">
            {view.tabs.deliverables}
          </TabsTrigger>
          <TabsTrigger value="history">{view.tabs.history}</TabsTrigger>
          <TabsTrigger value="settings">{view.tabs.settings}</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-3" value="deliverables">
          <DeliverablesTab
            locale={locale}
            messages={messages}
            onAdd={openDeliverables}
            onUpload={setUploadTarget}
            project={project.data}
          />
        </TabsContent>
        <TabsContent className="pt-3" value="history">
          <Frame className="w-full" dense spacing="default" variant="default">
            <FramePanel className="p-0">
              <ViewEmpty
                description={view.history.description}
                icon={<HistoryIcon aria-hidden="true" />}
                title={view.history.title}
              />
            </FramePanel>
          </Frame>
        </TabsContent>
        <TabsContent className="pt-3" value="settings">
          <SettingsTab
            currency={workspace.data.currency}
            locale={locale}
            messages={messages}
            project={project.data}
            terms={terms}
          />
        </TabsContent>
      </Tabs>
      <DeliverablesSheet
        locale={locale}
        messages={messages}
        onOpenChange={setDeliverablesOpen}
        project={deliverablesOpen ? project.data : undefined}
      />
      <VersionUploadSheet
        deliverable={uploadTarget}
        locale={locale}
        messages={messages}
        onOpenChange={closeUpload}
      />
      <DuplicateProjectDialog
        locale={locale}
        messages={messages}
        onOpenChange={setDuplicateOpen}
        open={duplicateOpen}
        source={project.data}
      />
    </>
  );
}
