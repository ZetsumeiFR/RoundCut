"use client";

import type { AppRouterClient } from "@roundcut/api/routers/index";
import { type FrameRate, formatTimecode } from "@roundcut/api/timecode";
import type { Locale } from "@roundcut/auth/locale";
import { Bubble, BubbleContent } from "@roundcut/ui/components/bubble";
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
  Message,
  MessageContent,
  MessageHeader,
} from "@roundcut/ui/components/message";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { CircleAlertIcon, ImageIcon, MessageSquareIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { VersionThumbnail } from "@/components/projects/version-thumbnail";
import { formatMessage, type Messages } from "@/i18n/messages";
import { FALLBACK_FRAME_RATE, type PlayerMarker } from "./video-player";

type FeedbackMessages = Messages["projects"]["player"]["feedback"];

export type FeedbackComment = Awaited<
  ReturnType<AppRouterClient["comment"]["list"]>
>[number];

const MARKER_LABEL_LENGTH = 80;
const SKELETON_ROWS = ["first", "second", "third"] as const;

export const toMarkers = (comments: FeedbackComment[]): PlayerMarker[] =>
  comments.map((item) => ({
    id: item.id,
    label:
      item.body.length > MARKER_LABEL_LENGTH
        ? `${item.body.slice(0, MARKER_LABEL_LENGTH)}…`
        : item.body,
    timeMs: item.timecodeMs,
  }));

function CommentItem({
  comment,
  dateFormat,
  frameRate,
  messages,
  onSeek,
}: {
  comment: FeedbackComment;
  dateFormat: Intl.DateTimeFormat;
  frameRate: FrameRate;
  messages: FeedbackMessages;
  onSeek: (ms: number) => void;
}) {
  const handleSeek = useCallback(
    () => onSeek(comment.timecodeMs),
    [comment.timecodeMs, onSeek]
  );
  const start = formatTimecode(comment.timecodeMs, frameRate);
  const position =
    comment.endTimecodeMs === null
      ? start
      : formatMessage(messages.range, {
          end: formatTimecode(comment.endTimecodeMs, frameRate),
          start,
        });
  const author = comment.authorName ?? messages.unknownAuthor;
  return (
    <li className="border-b p-3 last:border-b-0">
      <Message>
        <MessageContent>
          <MessageHeader className="flex-wrap gap-x-2 gap-y-1 px-0">
            <Button
              aria-label={formatMessage(messages.seek, { timecode: start })}
              className="font-mono tabular-nums"
              onClick={handleSeek}
              size="xs"
              type="button"
              variant="outline"
            >
              {position}
            </Button>
            <span className="min-w-0 truncate text-foreground">{author}</span>
            <time
              className="ms-auto shrink-0 font-normal"
              dateTime={comment.createdAt.toISOString()}
            >
              {dateFormat.format(comment.createdAt)}
            </time>
          </MessageHeader>
          <Bubble className="max-w-full" variant="muted">
            <BubbleContent className="whitespace-pre-wrap text-sm">
              {comment.body}
            </BubbleContent>
          </Bubble>
          {comment.attachmentUrl ? (
            <a
              aria-label={formatMessage(messages.viewAttachment, { author })}
              className="w-fit border outline-none ring-ring/50 transition-colors hover:border-primary focus-visible:ring-2"
              href={comment.attachmentUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <VersionThumbnail
                alt=""
                className="h-24 w-auto max-w-48 object-contain"
                fallback={
                  <span className="flex size-12 items-center justify-center text-muted-foreground">
                    <ImageIcon aria-hidden="true" className="size-4" />
                  </span>
                }
                src={comment.attachmentUrl}
              />
            </a>
          ) : null}
        </MessageContent>
      </Message>
    </li>
  );
}

// The timestamped thread of a version (REV-03), oldest timecode first: shared
// by the editor's review page and the client's review link.
export function CommentThread({
  comments,
  emptyDescription,
  emptyTitle,
  frameRate,
  isError,
  locale,
  messages,
  onRetry,
  onSeek,
  retryLabel,
}: {
  comments: FeedbackComment[] | undefined;
  emptyDescription: string;
  emptyTitle: string;
  frameRate: FrameRate | null;
  isError: boolean;
  locale: Locale;
  messages: FeedbackMessages;
  onRetry: () => void;
  onSeek: (ms: number) => void;
  retryLabel: string;
}) {
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [locale]
  );
  if (isError) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{messages.loadError}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            {retryLabel}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (!comments) {
    return (
      <div
        aria-label={messages.loading}
        className="flex flex-col gap-3 p-3"
        role="status"
      >
        {SKELETON_ROWS.map((row) => (
          <Skeleton className="h-14 w-full" key={row} />
        ))}
      </div>
    );
  }
  if (comments.length === 0) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col">
      {comments.map((item) => (
        <CommentItem
          comment={item}
          dateFormat={dateFormat}
          frameRate={frameRate ?? FALLBACK_FRAME_RATE}
          key={item.id}
          messages={messages}
          onSeek={onSeek}
        />
      ))}
    </ul>
  );
}
