"use client";

import type { Locale } from "@roundcut/auth/locale";
import {
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@roundcut/db/project-status";
import { Button } from "@roundcut/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@roundcut/ui/components/item";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@roundcut/ui/components/reui/frame";
import { IconTile } from "@roundcut/ui/components/reui/icon-tile";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  CircleAlertIcon,
  ClapperboardIcon,
  CoinsIcon,
  FolderOpenIcon,
  InboxIcon,
  PlusIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { deliverableCountLabel } from "@/components/projects/deliverable-form";
import type { Project } from "@/components/projects/project-sheet";
import { STATUS_BADGES } from "@/components/projects/projects-view";
import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { ProjectsEmptyIllustration } from "./projects-empty-illustration";

type DashboardMessages = Messages["dashboard"]["projects"];
type ProjectsMessages = Messages["projects"];
type StatusFilter = "active" | "all" | ProjectStatus;

const ALL_CLIENTS = "all";
const CENTS_PER_UNIT = 100;
const MS_PER_DAY = 86_400_000;
const SKELETON_CARDS = ["first", "second", "third"];
const INDICATOR_KEYS = [
  "openRounds",
  "submittedBatches",
  "extraRounds",
  "billable",
] as const;
// Late projects that are already approved or archived aren't overdue.
const DONE_STATUSES: readonly ProjectStatus[] = ["approved", "archived"];

const plural = (locale: Locale, count: number, one: string, other: string) =>
  formatMessage(
    new Intl.PluralRules(locale).select(count) === "one" ? one : other,
    { count }
  );

const matchesStatus = (status: ProjectStatus, filter: StatusFilter) => {
  if (filter === "all") {
    return true;
  }
  if (filter === "active") {
    return status !== "archived";
  }
  return status === filter;
};

// Target dates are calendar days (YYYY-MM-DD) read in local time.
const daysUntil = (targetDate: string) => {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  return Math.round(
    (new Date(`${targetDate}T00:00:00`).getTime() - start.getTime()) /
      MS_PER_DAY
  );
};

function DueDate({
  locale,
  messages,
  project,
}: {
  locale: Locale;
  messages: DashboardMessages;
  project: Project;
}) {
  if (!project.targetDate) {
    return (
      <span className="text-muted-foreground text-xs">{messages.noDue}</span>
    );
  }
  const days = daysUntil(project.targetDate);
  const when = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    days,
    "day"
  );
  if (days < 0 && !DONE_STATUSES.includes(project.status)) {
    return (
      <span className="font-medium text-destructive text-xs">
        {formatMessage(messages.overdue, { when })}
      </span>
    );
  }
  return (
    <span className="text-foreground text-xs">
      {formatMessage(messages.due, { when })}
    </span>
  );
}

// Project card adapted from ReUI card-21: icon, status, name, client and
// countdown to the target date.
function ProjectCard({
  locale,
  messages,
  project,
  projectsMessages,
}: {
  locale: Locale;
  messages: DashboardMessages;
  project: Project;
  projectsMessages: ProjectsMessages;
}) {
  const { includedRounds } = project.termsSnapshot;
  return (
    <FramePanel className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <IconTile variant="elevated">
          <ClapperboardIcon aria-hidden="true" />
        </IconTile>
        <Badge size="lg" variant={STATUS_BADGES[project.status]}>
          {projectsMessages.status[project.status]}
        </Badge>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Link
          className="truncate font-semibold text-foreground text-sm leading-tight transition-colors hover:text-primary"
          href={`/projects/${project.id}`}
        >
          {project.name}
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground text-xs">
            {project.client.name}
          </span>
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          />
          <DueDate locale={locale} messages={messages} project={project} />
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {deliverableCountLabel(
            projectsMessages.deliverables,
            locale,
            project.deliverables.length
          )}
          {" · "}
          {plural(
            locale,
            includedRounds,
            messages.includedRoundsOne,
            messages.includedRoundsOther
          )}
        </p>
      </div>
    </FramePanel>
  );
}

// KPI strip adapted from ReUI stats-18 (no meter: these counts have no total).
function Indicators({
  currency,
  locale,
  messages,
}: {
  currency: string | undefined;
  locale: Locale;
  messages: DashboardMessages["indicators"];
}) {
  const indicators = useQuery({
    ...orpc.project.indicators.queryOptions(),
    meta: { inlineError: true },
  });
  const values = indicators.data;
  const count = new Intl.NumberFormat(locale);
  const amount = currency
    ? new Intl.NumberFormat(locale, { currency, style: "currency" })
    : null;
  const cells: Record<
    (typeof INDICATOR_KEYS)[number],
    { caption: string; icon: ReactNode; title: string; value?: string }
  > = {
    billable: {
      caption: messages.billableCaption,
      icon: <CoinsIcon aria-hidden="true" />,
      title: messages.billable,
      value:
        values && amount
          ? amount.format(values.billableCents / CENTS_PER_UNIT)
          : undefined,
    },
    extraRounds: {
      caption: messages.extraRoundsCaption,
      icon: <PlusIcon aria-hidden="true" />,
      title: messages.extraRounds,
      value: values && count.format(values.extraRoundsThisMonth),
    },
    openRounds: {
      caption: messages.openRoundsCaption,
      icon: <RefreshCwIcon aria-hidden="true" />,
      title: messages.openRounds,
      value: values && count.format(values.openRounds),
    },
    submittedBatches: {
      caption: messages.submittedBatchesCaption,
      icon: <InboxIcon aria-hidden="true" />,
      title: messages.submittedBatches,
      value: values && count.format(values.submittedBatches),
    },
  };

  return (
    <Frame className="@container w-full" spacing="default">
      <FramePanel className="grid @4xl:grid-cols-4 @xl:grid-cols-2 @4xl:divide-x divide-y @4xl:divide-y-0 divide-border overflow-hidden p-0!">
        <h2 className="sr-only">{messages.label}</h2>
        {INDICATOR_KEYS.map((key) => {
          const cell = cells[key];
          return (
            <div className="flex min-w-0 flex-col gap-5 p-5" key={key}>
              <div className="flex min-w-0 items-center gap-3">
                <IconTile variant="elevated">{cell.icon}</IconTile>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 className="truncate font-medium text-sm">{cell.title}</h3>
                  <p className="text-muted-foreground text-xs">
                    {cell.caption}
                  </p>
                </div>
              </div>
              {cell.value === undefined ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="font-semibold text-2xl tabular-nums tracking-tight">
                  {cell.value}
                </p>
              )}
            </div>
          );
        })}
      </FramePanel>
    </Frame>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  const handleValueChange = useCallback(
    (next: string | null) => {
      if (next !== null) {
        onChange(next);
      }
    },
    [onChange]
  );
  const selected = options.find((option) => option.value === value);
  return (
    <Select onValueChange={handleValueChange} value={value}>
      <SelectTrigger aria-label={label} className="w-full sm:w-52">
        <SelectValue>{selected?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function CardsSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      className="grid @4xl:grid-cols-3 @xl:grid-cols-2 gap-1"
      role="status"
    >
      {SKELETON_CARDS.map((card) => (
        <FramePanel className="flex flex-col gap-6" key={card}>
          <Skeleton className="size-10" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </FramePanel>
      ))}
    </div>
  );
}

// Empty state adapted from ReUI empty-state-3: the quick start is the plan
// new projects will follow.
function DashboardEmpty({
  currency,
  hasClients,
  locale,
  messages,
  terms,
}: {
  currency: string;
  hasClients: boolean;
  locale: Locale;
  messages: DashboardMessages;
  terms: { extraRoundPriceCents: number; includedRounds: number };
}) {
  const price = new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(terms.extraRoundPriceCents / CENTS_PER_UNIT);
  const { empty } = messages;
  return (
    <FramePanel className="flex flex-col items-center gap-10 py-12">
      <Empty className="flex-none gap-6 border-0 p-0">
        <EmptyHeader className="max-w-md gap-4">
          <EmptyMedia className="mb-0 text-foreground">
            <ProjectsEmptyIllustration />
          </EmptyMedia>
          <EmptyTitle className="font-semibold text-xl tracking-tight">
            {empty.title}
          </EmptyTitle>
          <EmptyDescription>{empty.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {hasClients ? (
            <Button nativeButton={false} render={<Link href="/projects" />}>
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {empty.action}
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link href="/clients" />}>
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {empty.noClientAction}
            </Button>
          )}
        </EmptyContent>
      </Empty>
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <p className="text-muted-foreground text-sm">{empty.templatesTitle}</p>
        <Item
          className="min-w-0 hover:bg-muted/30"
          render={<Link href="/account/terms" />}
          variant="outline"
        >
          <ItemMedia className="text-muted-foreground">
            <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>
              {plural(
                locale,
                terms.includedRounds,
                messages.includedRoundsOne,
                messages.includedRoundsOther
              )}
            </ItemTitle>
            <ItemDescription>
              {formatMessage(empty.templateTerms, { price })}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="ml-auto text-muted-foreground">
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </ItemActions>
        </Item>
      </div>
    </FramePanel>
  );
}

function MessagePanel({
  action,
  description,
  icon,
  title,
}: {
  action: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <FramePanel>
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{action}</EmptyContent>
      </Empty>
    </FramePanel>
  );
}

export function ProjectsDashboard({
  locale,
  messages,
  projectsMessages,
}: {
  locale: Locale;
  messages: DashboardMessages;
  projectsMessages: ProjectsMessages;
}) {
  const projects = useQuery({
    ...orpc.project.list.queryOptions(),
    meta: { inlineError: true },
  });
  const workspace = useQuery({
    ...orpc.workspace.get.queryOptions(),
    meta: { inlineError: true },
  });
  const clients = useQuery({
    ...orpc.client.list.queryOptions(),
    meta: { inlineError: true },
  });
  const [status, setStatus] = useState<StatusFilter>("active");
  const [clientId, setClientId] = useState(ALL_CLIENTS);
  const handleStatusChange = useCallback(
    (value: string) => setStatus(value as StatusFilter),
    []
  );
  const clearFilters = useCallback(() => {
    setStatus("active");
    setClientId(ALL_CLIENTS);
  }, []);

  const statusOptions = useMemo(
    () => [
      { label: messages.statusActive, value: "active" },
      { label: messages.statusAll, value: "all" },
      ...PROJECT_STATUSES.map((value) => ({
        label: projectsMessages.status[value],
        value,
      })),
    ],
    [messages, projectsMessages.status]
  );
  const clientOptions = useMemo(() => {
    const byId = new Map(
      (projects.data ?? []).map((project) => [
        project.client.id,
        project.client.name,
      ])
    );
    return [
      { label: messages.allClients, value: ALL_CLIENTS },
      ...[...byId]
        .map(([value, label]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    ];
  }, [locale, messages.allClients, projects.data]);
  const shown = useMemo(
    () =>
      (projects.data ?? []).filter(
        (project) =>
          matchesStatus(project.status, status) &&
          (clientId === ALL_CLIENTS || project.client.id === clientId)
      ),
    [clientId, projects.data, status]
  );

  const refetchProjects = projects.refetch;
  const refetchWorkspace = workspace.refetch;
  const refetchClients = clients.refetch;
  const handleRetry = useCallback(
    () =>
      Promise.all([refetchProjects(), refetchWorkspace(), refetchClients()]),
    [refetchClients, refetchProjects, refetchWorkspace]
  );

  const isError = projects.isError || workspace.isError || clients.isError;
  const hasProjects = Boolean(projects.data?.length);

  let body: ReactNode = <CardsSkeleton label={messages.loading} />;
  if (isError) {
    body = (
      <MessagePanel
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
  } else if (projects.data && workspace.data && clients.data && !hasProjects) {
    body = (
      <DashboardEmpty
        currency={workspace.data.currency}
        hasClients={clients.data.length > 0}
        locale={locale}
        messages={messages}
        terms={workspace.data.revisionTerms}
      />
    );
  } else if (projects.data && shown.length === 0) {
    body = (
      <MessagePanel
        action={
          <Button onClick={clearFilters} type="button" variant="outline">
            {messages.filteredEmpty.action}
          </Button>
        }
        description={messages.filteredEmpty.description}
        icon={<FolderOpenIcon aria-hidden="true" />}
        title={messages.filteredEmpty.title}
      />
    );
  } else if (projects.data) {
    body = (
      <ul className="grid @4xl:grid-cols-3 @xl:grid-cols-2 gap-1">
        {shown.map((project) => (
          <li className="flex min-w-0 flex-col" key={project.id}>
            <ProjectCard
              locale={locale}
              messages={messages}
              project={project}
              projectsMessages={projectsMessages}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Indicators
        currency={workspace.data?.currency}
        locale={locale}
        messages={messages.indicators}
      />
      <Frame className="@container w-full" spacing="default">
        <FrameHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <FrameTitle>
              <h2 className="font-semibold text-base">{messages.title}</h2>
            </FrameTitle>
            <FrameDescription className="text-xs tabular-nums">
              {projects.data
                ? plural(
                    locale,
                    shown.length,
                    messages.countOne,
                    messages.countOther
                  )
                : messages.loading}
            </FrameDescription>
          </div>
          {hasProjects ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <FilterSelect
                label={messages.statusFilter}
                onChange={handleStatusChange}
                options={statusOptions}
                value={status}
              />
              <FilterSelect
                label={messages.clientFilter}
                onChange={setClientId}
                options={clientOptions}
                value={clientId}
              />
              <Button
                nativeButton={false}
                render={<Link href="/projects" />}
                variant="outline"
              >
                {messages.manage}
              </Button>
            </div>
          ) : null}
        </FrameHeader>
        {body}
      </Frame>
    </div>
  );
}
