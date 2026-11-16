"use client";

import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { Separator } from "@roundcut/ui/components/separator";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRightIcon,
  CircleAlertIcon,
  CloudUploadIcon,
  Columns2Icon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client, orpc } from "@/utils/orpc";
import { ComparePlayer, CompareTitle } from "./compare-player";
import { isNotFound, ReviewState, retryUnlessMissing } from "./review-view";

type ProjectsMessages = Messages["projects"];

export function CompareViewSkeleton({ label }: { label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col gap-4" role="status">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="aspect-video w-full" />
      </div>
    </div>
  );
}

// Same query key as the review page: both share the signed URL cache.
function usePlayback(versionId: string | undefined) {
  return useQuery({
    enabled: Boolean(versionId),
    meta: { inlineError: true },
    queryFn: () => client.version.playbackUrl({ id: versionId ?? "" }),
    queryKey: ["playback", versionId],
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function VersionSelect({
  label,
  onChange,
  options,
  value,
  versionLabel,
}: {
  label: string;
  onChange: (id: string | null) => void;
  options: { id: string; number: number }[];
  value: string;
  versionLabel: (number: number) => string;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={label} className="w-24" size="sm">
        <SelectValue>
          {selected ? versionLabel(selected.number) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {versionLabel(option.number)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// Side-by-side comparison of two versions of a deliverable (VER-08). The
// version in the path sits on the right; `with` picks the left one and
// defaults to the previous version.
export function CompareView({
  locale,
  messages,
  projectId,
  versionId,
  withId,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  projectId: string;
  versionId: string;
  withId: string | undefined;
}) {
  const router = useRouter();
  const { player } = messages;
  const { compare } = player;
  const project = useQuery(
    orpc.project.get.queryOptions({
      input: { id: projectId },
      meta: { inlineError: true },
      retry: retryUnlessMissing,
    })
  );
  const version = useQuery(
    orpc.version.get.queryOptions({
      input: { id: versionId },
      meta: { inlineError: true },
      retry: retryUnlessMissing,
    })
  );
  const deliverableId = version.data?.deliverableId ?? "";
  const versions = useQuery(
    orpc.version.list.queryOptions({
      enabled: Boolean(deliverableId),
      input: { deliverableId },
      meta: { inlineError: true },
    })
  );
  const ready = useMemo(
    () => (versions.data ?? []).filter((item) => item.status !== "uploading"),
    [versions.data]
  );
  const current = version.data;
  const others = ready.filter((item) => item.id !== versionId);
  const other =
    others.find((item) => item.id === withId) ??
    (current && others.find((item) => item.number < current.number)) ??
    others[0];
  const playable = current !== undefined && current.status !== "uploading";
  const rightPlayback = usePlayback(playable ? versionId : undefined);
  const leftPlayback = usePlayback(other?.id);

  const refetchProject = project.refetch;
  const refetchVersion = version.refetch;
  const refetchVersions = versions.refetch;
  const refetchLeft = leftPlayback.refetch;
  const refetchRight = rightPlayback.refetch;
  const handleRetry = useCallback(
    () =>
      Promise.all([
        refetchProject(),
        refetchVersion(),
        refetchVersions(),
        refetchLeft(),
        refetchRight(),
      ]),
    [refetchLeft, refetchProject, refetchRight, refetchVersion, refetchVersions]
  );
  const handleSourceError = useCallback(
    (side: 0 | 1) => (side === 0 ? refetchLeft() : refetchRight()),
    [refetchLeft, refetchRight]
  );

  const compareHref = useCallback(
    (right: string, left: string) =>
      `/projects/${projectId}/versions/${right}/compare?with=${left}` as const,
    [projectId]
  );
  const otherId = other?.id;
  const handleLeftChange = useCallback(
    (id: string | null) => {
      if (id && id !== otherId) {
        router.replace(compareHref(versionId, id));
      }
    },
    [compareHref, otherId, router, versionId]
  );
  const handleRightChange = useCallback(
    (id: string | null) => {
      if (id && id !== versionId && otherId) {
        router.replace(compareHref(id, otherId));
      }
    },
    [compareHref, otherId, router, versionId]
  );
  const handleSwap = useCallback(() => {
    if (otherId) {
      router.replace(compareHref(otherId, versionId));
    }
  }, [compareHref, otherId, router, versionId]);

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale]
  );
  const versionLabel = useCallback(
    (number: number) => formatMessage(player.version, { number }),
    [player.version]
  );

  const deliverable = project.data?.deliverables.find(
    (item) => item.id === current?.deliverableId
  );
  const reviewHref = `/projects/${projectId}/versions/${versionId}` as const;
  const missing =
    isNotFound(project.error) ||
    isNotFound(version.error) ||
    (project.data && current && !deliverable);
  if (missing) {
    return (
      <ReviewState
        action={
          <Button
            nativeButton={false}
            render={<Link href={`/projects/${projectId}`} />}
          >
            {player.notFound.action}
          </Button>
        }
        description={player.notFound.description}
        icon={<SearchXIcon aria-hidden="true" />}
        title={player.notFound.title}
      />
    );
  }
  if (
    project.isError ||
    version.isError ||
    versions.isError ||
    leftPlayback.isError ||
    rightPlayback.isError
  ) {
    return (
      <ReviewState
        action={
          <Button onClick={handleRetry} type="button" variant="outline">
            {messages.retry}
          </Button>
        }
        description={messages.loadErrorDescription}
        icon={<CircleAlertIcon aria-hidden="true" />}
        title={compare.loadErrorTitle}
      />
    );
  }
  if (!(project.data && current && deliverable && versions.data)) {
    return <CompareViewSkeleton label={compare.loading} />;
  }
  if (!playable) {
    return (
      <ReviewState
        description={player.uploading.description}
        icon={<CloudUploadIcon aria-hidden="true" />}
        title={player.uploading.title}
      />
    );
  }
  if (!other) {
    return (
      <ReviewState
        action={
          <Button nativeButton={false} render={<Link href={reviewHref} />}>
            {formatMessage(compare.back, { number: current.number })}
          </Button>
        }
        description={compare.emptyDescription}
        icon={<Columns2Icon aria-hidden="true" />}
        title={compare.emptyTitle}
      />
    );
  }

  const sideTitle = (item: typeof current) => (
    <CompareTitle
      number={versionLabel(item.number)}
      uploadedAt={formatMessage(compare.uploadedAt, {
        date: dateFormat.format(new Date(item.createdAt)),
      })}
    />
  );

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center">
          <Button
            aria-label={formatMessage(compare.back, { number: current.number })}
            className="-ms-2 shrink-0"
            nativeButton={false}
            render={<Link href={reviewHref} />}
            size="icon-sm"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
          <Separator
            className="my-auto ms-2 me-4 h-4 shrink-0"
            orientation="vertical"
          />
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate font-medium text-base">
              {formatMessage(compare.title, {
                deliverable: deliverable.title,
                left: other.number,
                right: current.number,
              })}
            </h1>
            <p className="truncate text-muted-foreground text-xs">
              {project.data.name} · {project.data.client.name}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <VersionSelect
            label={compare.leftLabel}
            onChange={handleLeftChange}
            options={others}
            value={other.id}
            versionLabel={versionLabel}
          />
          <Button
            aria-label={compare.swap}
            onClick={handleSwap}
            size="icon-sm"
            title={compare.swap}
            type="button"
            variant="outline"
          >
            <ArrowLeftRightIcon aria-hidden="true" />
          </Button>
          <VersionSelect
            label={compare.rightLabel}
            onChange={handleRightChange}
            options={ready.filter((item) => item.id !== other.id)}
            value={versionId}
            versionLabel={versionLabel}
          />
        </div>
      </header>
      <ComparePlayer
        key={`${other.id}:${versionId}`}
        locale={locale}
        messages={player}
        onSourceError={handleSourceError}
        sides={[
          {
            durationMs: other.durationMs,
            frameRate: other.frameRate,
            number: other.number,
            poster: other.thumbnailUrl,
            src: leftPlayback.data?.url,
          },
          {
            durationMs: current.durationMs,
            frameRate: current.frameRate,
            number: current.number,
            poster: current.thumbnailUrl,
            src: rightPlayback.data?.url,
          },
        ]}
        titles={[sideTitle(other), sideTitle(current)]}
      />
    </>
  );
}
