"use client";

import { ORPCError } from "@orpc/client";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { cn } from "@roundcut/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  ClapperboardIcon,
  ClockAlertIcon,
  LinkIcon,
  PlayIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { VersionThumbnail } from "@/components/projects/version-thumbnail";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { BrandLogo, brandStyle } from "./brand";
import { CommentComposer } from "./comment-composer";
import { CommentThread, type ReplyHandler, toMarkers } from "./comment-thread";
import { PasteFeedback } from "./paste-feedback";
import { ReviewState } from "./review-view";
import { ReviewerIdentityForm } from "./reviewer-identity-form";
import { SubmitBatch } from "./submit-batch";
import { type PlayerHandle, VideoPlayer } from "./video-player";

type ReviewMessages = Messages["review"];
type PlayerMessages = Messages["projects"]["player"];
type LinkedProject = Awaited<
  ReturnType<AppRouterClient["review"]["resolveLink"]>
>;
type ReviewerProject = Extract<LinkedProject, { deliverables: unknown }>;
type LinkedDeliverable = ReviewerProject["deliverables"][number];

const MAX_RETRIES = 3;

// Unknown, revoked and malformed tokens all read as an invalid link.
const isInvalidLink = (error: unknown) =>
  error instanceof ORPCError &&
  (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST");

const isExpiredLink = (error: unknown) =>
  error instanceof ORPCError && error.code === "LINK_EXPIRED";

const retryTransient = (failures: number, error: unknown) =>
  !(isInvalidLink(error) || isExpiredLink(error)) && failures < MAX_RETRIES;

export function ClientReviewSkeleton({ label }: { label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col gap-4" role="status">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-64 max-w-full" />
      </div>
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function DeliverableItem({
  approvedLabel,
  deliverable,
  messages,
  onSelect,
  selected,
}: {
  approvedLabel: string;
  deliverable: LinkedDeliverable;
  messages: ReviewMessages;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const version = deliverable.latestVersion;
  const handleClick = useCallback(
    () => onSelect(deliverable.id),
    [deliverable.id, onSelect]
  );
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        aria-label={formatMessage(messages.play, { title: deliverable.title })}
        className={cn(
          "flex w-full items-center gap-3 border p-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
          selected && "border-primary bg-muted"
        )}
        disabled={!version}
        onClick={handleClick}
        type="button"
      >
        <VersionThumbnail
          alt=""
          className="aspect-video w-20 shrink-0 border object-cover"
          fallback={<PlayIcon aria-hidden="true" className="size-4" />}
          src={version?.thumbnailUrl ?? null}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-sm">
            {deliverable.title}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            {version
              ? formatMessage(messages.version, { number: version.number })
              : messages.noVersion}
            {version?.status === "approved" ? (
              <Badge size="sm" variant="success-light">
                {approvedLabel}
              </Badge>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function ReviewHeader({
  locale,
  messages,
  onSwitchReviewer,
  project,
}: {
  locale: Locale;
  messages: ReviewMessages;
  onSwitchReviewer: () => void;
  project: LinkedProject;
}) {
  const { brand, reviewer } = project;
  return (
    <header className="flex flex-col gap-1">
      {brand?.logoUrl ? (
        <BrandLogo
          alt={formatMessage(messages.brandLogo, {
            workspace: project.workspaceName,
          })}
          className="mb-2 h-10 w-auto max-w-48 self-start object-contain"
          src={brand.logoUrl}
        />
      ) : null}
      <p className="text-muted-foreground text-xs">
        {formatMessage(messages.sharedBy, {
          client: project.clientName,
          workspace: project.workspaceName,
        })}
      </p>
      <h1 className="break-words font-semibold text-lg">{project.name}</h1>
      {project.expiresAt ? (
        <p className="text-muted-foreground text-xs">
          {formatMessage(messages.expiresAt, {
            date: new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
            }).format(project.expiresAt),
          })}
        </p>
      ) : null}
      {reviewer ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          <span className="min-w-0 break-words">
            {formatMessage(messages.identity.signedInAs, {
              name: reviewer.name,
            })}
          </span>
          {reviewer.isDecider ? (
            <Badge variant="info-light">{messages.identity.decider}</Badge>
          ) : null}
          <Button
            className="h-auto p-0 text-xs"
            onClick={onSwitchReviewer}
            type="button"
            variant="link"
          >
            {messages.identity.switch}
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function LinkedReview({
  locale,
  messages,
  onSourceError,
  player,
  project,
  token,
}: {
  locale: Locale;
  messages: ReviewMessages;
  onSourceError: () => void;
  player: PlayerMessages;
  project: ReviewerProject;
  token: string;
}) {
  const playable = project.deliverables.filter((item) => item.latestVersion);
  const [selectedId, setSelectedId] = useState(playable[0]?.id);
  const selected =
    playable.find((item) => item.id === selectedId) ?? playable[0];
  const version = selected?.latestVersion;
  // An approved version is frozen (APPR-02): read-only thread, no composer.
  const approved = version?.status === "approved";
  const playerRef = useRef<PlayerHandle | null>(null);
  const comments = useQuery(
    orpc.comment.listForReview.queryOptions({
      enabled: Boolean(version),
      input: { token, versionId: version?.id ?? "" },
      meta: { inlineError: true },
      retry: retryTransient,
    })
  );
  const markers = useMemo(
    () => toMarkers(comments.data ?? []),
    [comments.data]
  );
  const refetchComments = comments.refetch;
  const handleRetryComments = useCallback(
    () => refetchComments(),
    [refetchComments]
  );
  const handleSeek = useCallback(
    (ms: number) => playerRef.current?.seekToMs(ms),
    []
  );
  const queryClient = useQueryClient();
  const handleReply = useCallback<ReplyHandler>(
    async (parentId, body) => {
      await api.comment.replyForReview({ body, parentId, token });
      await queryClient.invalidateQueries({
        queryKey: orpc.comment.listForReview.key(),
      });
    },
    [queryClient, token]
  );

  return (
    <>
      {selected && version ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate font-medium text-sm">
              {formatMessage(messages.title, {
                deliverable: selected.title,
                number: version.number,
              })}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {approved ? (
                <Badge variant="success-light">{player.approved}</Badge>
              ) : null}
              <Badge variant="info-light">
                {formatMessage(messages.version, { number: version.number })}
              </Badge>
            </div>
          </div>
          <SubmitBatch
            isDecider={project.reviewer.isDecider}
            locale={locale}
            messages={messages.submit}
            offerMessages={messages.extraRound}
            token={token}
            versionId={version.id}
            workspaceName={project.workspaceName}
          />
          <div className="min-w-0 border">
            <VideoPlayer
              durationMs={version.durationMs}
              frameRate={version.frameRate}
              key={version.id}
              locale={locale}
              markers={markers}
              messages={player}
              onSourceError={onSourceError}
              poster={version.thumbnailUrl}
              ref={playerRef}
              src={version.playbackUrl}
            />
          </div>
          {approved ? (
            <p className="text-muted-foreground text-sm">
              {player.feedback.frozen}
            </p>
          ) : (
            <>
              <CommentComposer
                durationMs={version.durationMs}
                frameRate={version.frameRate}
                key={version.id}
                locale={locale}
                messages={messages.comments}
                playerRef={playerRef}
                token={token}
                versionId={version.id}
              />
              <PasteFeedback
                durationMs={version.durationMs}
                frameRate={version.frameRate}
                key={`paste-${version.id}`}
                locale={locale}
                messages={messages.comments.paste}
                token={token}
                versionId={version.id}
              />
            </>
          )}
          <h2 className="pt-2 font-medium text-sm">
            {messages.comments.thread}
          </h2>
          <div className="border">
            <CommentThread
              comments={comments.data}
              emptyDescription={messages.comments.emptyDescription}
              emptyTitle={messages.comments.emptyTitle}
              frameRate={version.frameRate}
              isError={comments.isError}
              locale={locale}
              messages={player.feedback}
              onReply={approved ? undefined : handleReply}
              onRetry={handleRetryComments}
              onSeek={handleSeek}
              retryLabel={messages.retry}
            />
          </div>
        </section>
      ) : (
        <div className="border">
          <ReviewState
            description={messages.emptyDescription}
            icon={<ClapperboardIcon aria-hidden="true" />}
            title={messages.emptyTitle}
          />
        </div>
      )}
      {project.deliverables.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-sm">{messages.videos}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {project.deliverables.map((item) => (
              <DeliverableItem
                approvedLabel={player.approved}
                deliverable={item}
                key={item.id}
                messages={messages}
                onSelect={setSelectedId}
                selected={item.id === selected?.id}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function ClientReviewView({
  locale,
  messages,
  player,
  token,
}: {
  locale: Locale;
  messages: ReviewMessages;
  player: PlayerMessages;
  token: string;
}) {
  const project = useQuery(
    orpc.review.resolveLink.queryOptions({
      input: { token },
      meta: { inlineError: true },
      retry: retryTransient,
      // Refetching signs new playback URLs, which would restart the video:
      // only the player's error handler asks for fresh ones.
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
  const { refetch } = project;
  const handleRetry = useCallback(() => refetch(), [refetch]);
  const queryClient = useQueryClient();
  const handleSwitchReviewer = useCallback(async () => {
    await api.review.forgetIdentity({ token });
    await queryClient.invalidateQueries({
      queryKey: orpc.review.resolveLink.key(),
    });
  }, [queryClient, token]);

  if (isExpiredLink(project.error)) {
    return (
      <ReviewState
        description={messages.expired.description}
        icon={<ClockAlertIcon aria-hidden="true" />}
        title={messages.expired.title}
      />
    );
  }
  if (isInvalidLink(project.error)) {
    return (
      <ReviewState
        description={messages.invalid.description}
        icon={<LinkIcon aria-hidden="true" />}
        title={messages.invalid.title}
      />
    );
  }
  if (project.isError) {
    return (
      <ReviewState
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
  }
  if (!project.data) {
    return <ClientReviewSkeleton label={messages.loading} />;
  }
  // The editor's accent color (REV-10) recolors every primary element of
  // the page: the theme reads --primary at use.
  return (
    <div
      className="contents"
      style={brandStyle(project.data.brand?.accentColor)}
    >
      <ReviewHeader
        locale={locale}
        messages={messages}
        onSwitchReviewer={handleSwitchReviewer}
        project={project.data}
      />
      {project.data.reviewer === null ? (
        <ReviewerIdentityForm
          messages={messages.identity}
          token={token}
          workspaceName={project.data.workspaceName}
        />
      ) : (
        <LinkedReview
          locale={locale}
          messages={messages}
          onSourceError={handleRetry}
          player={player}
          project={project.data}
          token={token}
        />
      )}
    </div>
  );
}
