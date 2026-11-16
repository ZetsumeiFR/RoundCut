"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
import {
  CLIENT_DOWNLOAD_POLICIES,
  type ClientDownloadPolicy,
} from "@roundcut/db/version";
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
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@roundcut/ui/components/reui/frame";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  CloudUploadIcon,
  DownloadIcon,
  MessageSquareIcon,
  SearchXIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";

import {
  type UploadTarget,
  VersionUploadSheet,
} from "@/components/projects/version-upload-sheet";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client, orpc } from "@/utils/orpc";
import { type PlayerMarker, VideoPlayer } from "./video-player";

type ProjectsMessages = Messages["projects"];

const MAX_RETRIES = 3;
// Feedback comments arrive with REV-03; until then no version has markers.
const NO_MARKERS: PlayerMarker[] = [];

const isNotFound = (error: unknown) =>
  error instanceof ORPCError && error.code === "NOT_FOUND";

const retryUnlessMissing = (failures: number, error: unknown) =>
  !isNotFound(error) && failures < MAX_RETRIES;

function ReviewState({
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

export function ReviewViewSkeleton({ label }: { label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col gap-4" role="status">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function FeedbackPanel({ messages }: { messages: ProjectsMessages["player"] }) {
  return (
    <Frame className="w-full" dense spacing="default" variant="default">
      <FrameHeader>
        <FrameTitle>
          <h2 className="font-semibold text-sm">{messages.feedback.title}</h2>
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="p-0">
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{messages.feedback.emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {messages.feedback.emptyDescription}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </FramePanel>
    </Frame>
  );
}

const isClientDownloadPolicy = (
  value: unknown
): value is ClientDownloadPolicy =>
  CLIENT_DOWNLOAD_POLICIES.some((policy) => policy === value);

// The editor downloads the original file and decides, per version, whether
// the client may download it too (VER-07).
function DownloadControls({
  clientCanDownload,
  clientDownload,
  messages,
  versionId,
}: {
  clientCanDownload: boolean;
  clientDownload: ClientDownloadPolicy;
  messages: ProjectsMessages["player"]["download"];
  versionId: string;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handlePolicyChange = useCallback(
    async (value: unknown) => {
      if (!isClientDownloadPolicy(value) || value === clientDownload) {
        return;
      }
      setSaving(true);
      try {
        await client.version.updateClientDownload({
          clientDownload: value,
          id: versionId,
        });
        toast.success(messages.saved);
      } catch {
        toast.error(messages.saveError);
      } finally {
        await queryClient.invalidateQueries({
          queryKey: orpc.version.key(),
        });
        setSaving(false);
      }
    },
    [clientDownload, messages, queryClient, versionId]
  );

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const { url } = await client.version.downloadUrl({ id: versionId });
      // The signed URL answers as an attachment: the page stays put.
      window.location.assign(url);
    } catch {
      toast.error(messages.error);
    } finally {
      setDownloading(false);
    }
  }, [messages.error, versionId]);

  return (
    <>
      <Select
        disabled={saving}
        onValueChange={handlePolicyChange}
        value={clientDownload}
      >
        <SelectTrigger
          aria-label={messages.clientLabel}
          className="w-auto"
          size="sm"
          title={clientCanDownload ? messages.available : messages.unavailable}
        >
          <SelectValue>{messages.policies[clientDownload]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {CLIENT_DOWNLOAD_POLICIES.map((policy) => (
              <SelectItem key={policy} value={policy}>
                {messages.policies[policy]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        aria-label={messages.action}
        disabled={downloading}
        onClick={handleDownload}
        size="icon-sm"
        title={messages.action}
        type="button"
        variant="outline"
      >
        <DownloadIcon aria-hidden="true" />
      </Button>
    </>
  );
}

export function ReviewView({
  locale,
  messages,
  projectId,
  versionId,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  projectId: string;
  versionId: string;
}) {
  const router = useRouter();
  const { player } = messages;
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
    })
  );
  const playable =
    version.data !== undefined && version.data.status !== "uploading";
  // Kept out of the version key: publishing a new version must not swap the
  // signed URL (and restart) the video being reviewed.
  const playback = useQuery({
    enabled: playable,
    meta: { inlineError: true },
    queryFn: () => client.version.playbackUrl({ id: versionId }),
    queryKey: ["playback", versionId],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>();
  const closeUpload = useCallback((open: boolean) => {
    if (!open) {
      setUploadTarget(undefined);
    }
  }, []);

  const refetchProject = project.refetch;
  const refetchVersion = version.refetch;
  const refetchPlayback = playback.refetch;
  const handleRetry = useCallback(
    () => Promise.all([refetchProject(), refetchVersion(), refetchPlayback()]),
    [refetchPlayback, refetchProject, refetchVersion]
  );
  const handleSourceError = useCallback(() => {
    refetchPlayback();
  }, [refetchPlayback]);
  const handleVersionChange = useCallback(
    (id: string | null) => {
      if (id && id !== versionId) {
        router.push(`/projects/${projectId}/versions/${id}`);
      }
    },
    [projectId, router, versionId]
  );

  const deliverable = project.data?.deliverables.find(
    (item) => item.id === version.data?.deliverableId
  );
  const openUpload = useCallback(() => {
    if (deliverable) {
      setUploadTarget({ id: deliverable.id, title: deliverable.title });
    }
  }, [deliverable]);

  const projectHref = `/projects/${projectId}` as const;
  const missing =
    isNotFound(project.error) ||
    isNotFound(version.error) ||
    (project.data && version.data && !deliverable);
  if (missing) {
    return (
      <ReviewState
        action={
          <Button nativeButton={false} render={<Link href={projectHref} />}>
            {player.notFound.action}
          </Button>
        }
        description={player.notFound.description}
        icon={<SearchXIcon aria-hidden="true" />}
        title={player.notFound.title}
      />
    );
  }
  if (project.isError || version.isError || playback.isError) {
    return (
      <ReviewState
        action={
          <Button onClick={handleRetry} type="button" variant="outline">
            {messages.retry}
          </Button>
        }
        description={messages.loadErrorDescription}
        icon={<CircleAlertIcon aria-hidden="true" />}
        title={player.loadErrorTitle}
      />
    );
  }
  if (!(project.data && version.data && deliverable)) {
    return <ReviewViewSkeleton label={player.loading} />;
  }

  const { includedRounds } = project.data.termsSnapshot;
  const currentRound = deliverable.review.currentRound?.number ?? 0;
  const readyVersions = (versions.data ?? []).filter(
    (item) => item.status !== "uploading"
  );

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center">
          <Button
            aria-label={formatMessage(player.back, {
              project: project.data.name,
            })}
            className="-ms-2 shrink-0"
            nativeButton={false}
            render={<Link href={projectHref} />}
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
              {formatMessage(player.title, {
                deliverable: deliverable.title,
                number: version.data.number,
              })}
            </h1>
            <p className="truncate text-muted-foreground text-xs">
              {project.data.name} · {project.data.client.name}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {currentRound > 0 ? (
            <Badge
              size="lg"
              variant={
                currentRound > includedRounds ? "warning-light" : "info-light"
              }
            >
              {formatMessage(player.round, {
                current: currentRound,
                included: includedRounds,
              })}
            </Badge>
          ) : null}
          <Select onValueChange={handleVersionChange} value={versionId}>
            <SelectTrigger
              aria-label={player.versionLabel}
              className="w-24"
              size="sm"
            >
              <SelectValue>
                {formatMessage(player.version, { number: version.data.number })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {readyVersions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {formatMessage(player.version, { number: item.number })}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {playable ? (
            <DownloadControls
              clientCanDownload={version.data.clientCanDownload}
              clientDownload={version.data.clientDownload}
              messages={player.download}
              versionId={versionId}
            />
          ) : null}
          <Button onClick={openUpload} size="sm" type="button">
            <UploadIcon aria-hidden="true" data-icon="inline-start" />
            {player.newVersion}
          </Button>
        </div>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {playable ? (
          <div className="min-w-0 border">
            {playback.data ? (
              <VideoPlayer
                durationMs={version.data.durationMs}
                frameRate={version.data.frameRate}
                locale={locale}
                markers={NO_MARKERS}
                messages={player}
                onSourceError={handleSourceError}
                poster={version.data.thumbnailUrl}
                src={playback.data.url}
              />
            ) : (
              <Skeleton className="aspect-video w-full" />
            )}
          </div>
        ) : (
          <div className="border">
            <ReviewState
              description={player.uploading.description}
              icon={<CloudUploadIcon aria-hidden="true" />}
              title={player.uploading.title}
            />
          </div>
        )}
        <FeedbackPanel messages={player} />
      </div>
      <VersionUploadSheet
        deliverable={uploadTarget}
        locale={locale}
        messages={messages}
        onOpenChange={closeUpload}
      />
    </>
  );
}
