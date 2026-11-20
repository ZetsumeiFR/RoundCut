"use client";

import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_REJECT_REASON_MAX_LENGTH,
  type CommentStatusInput,
} from "@roundcut/api/comment";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import { type FrameRate, formatTimecode } from "@roundcut/api/timecode";
import type { Locale } from "@roundcut/auth/locale";
import type { CommentStatus } from "@roundcut/db/comment";
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
import { Field, FieldError, FieldLabel } from "@roundcut/ui/components/field";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@roundcut/ui/components/message";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { Textarea } from "@roundcut/ui/components/textarea";
import {
  CheckIcon,
  CircleAlertIcon,
  ImageIcon,
  MessageSquareIcon,
  ReplyIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { VersionThumbnail } from "@/components/projects/version-thumbnail";
import { formatMessage, type Messages } from "@/i18n/messages";
import { FALLBACK_FRAME_RATE, type PlayerMarker } from "./video-player";

type FeedbackMessages = Messages["projects"]["player"]["feedback"];

export type FeedbackComment = Awaited<
  ReturnType<AppRouterClient["comment"]["list"]>
>[number];

type FeedbackReply = FeedbackComment["replies"][number];

export type ReplyHandler = (parentId: string, body: string) => Promise<void>;

export type StatusHandler = (input: CommentStatusInput) => Promise<void>;

const MARKER_LABEL_LENGTH = 80;
const SKELETON_ROWS = ["first", "second", "third"] as const;

const STATUS_BADGES = {
  done: "success-light",
  open: "warning-light",
  rejected: "destructive-light",
} as const satisfies Record<CommentStatus, string>;

// Replies share their thread's timecode: only threads become markers.
export const toMarkers = (comments: FeedbackComment[]): PlayerMarker[] =>
  comments.map((item) => ({
    id: item.id,
    label:
      item.body.length > MARKER_LABEL_LENGTH
        ? `${item.body.slice(0, MARKER_LABEL_LENGTH)}…`
        : item.body,
    timeMs: item.timecodeMs,
  }));

const authorOf = (
  item: Pick<FeedbackReply, "authorName" | "authorType">,
  messages: FeedbackMessages
) =>
  item.authorName ??
  (item.authorType === "editor"
    ? messages.unknownEditor
    : messages.unknownAuthor);

// A short text sent from inside a thread: a reply, or the reason for refusing
// a comment. Failures keep the text and surface as a toast.
function ThreadTextForm({
  errorMessage,
  label,
  maxLength,
  messages,
  onCancel,
  onSubmit,
  placeholder,
  requiredMessage,
  submitLabel,
}: {
  errorMessage: string;
  label: string;
  maxLength: number;
  messages: FeedbackMessages;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void>;
  placeholder: string;
  requiredMessage: string;
  submitLabel: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
      setError(undefined);
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) {
        setError(requiredMessage);
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit(trimmed);
        setText("");
      } catch {
        toast.error(errorMessage);
      } finally {
        setSubmitting(false);
      }
    },
    [errorMessage, onSubmit, requiredMessage, text]
  );

  const buttonLabel = submitting ? messages.sending : submitLabel;
  return (
    <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
      <Field className="gap-1.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          autoFocus
          className="min-h-16 text-sm md:text-sm"
          id={id}
          maxLength={maxLength}
          onChange={handleChange}
          placeholder={placeholder}
          value={text}
        />
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          {messages.cancel}
        </Button>
        <Button disabled={submitting} size="sm" type="submit">
          {buttonLabel}
        </Button>
      </div>
    </form>
  );
}

function ReplyItem({
  dateFormat,
  messages,
  reply,
}: {
  dateFormat: Intl.DateTimeFormat;
  messages: FeedbackMessages;
  reply: FeedbackReply;
}) {
  const isEditor = reply.authorType === "editor";
  return (
    <li>
      <Message>
        <MessageContent>
          <MessageHeader className="flex-wrap gap-x-2 gap-y-1 px-0">
            <span className="min-w-0 truncate text-foreground">
              {authorOf(reply, messages)}
            </span>
            {isEditor ? (
              <Badge size="sm" variant="info-light">
                {messages.editorBadge}
              </Badge>
            ) : null}
            <time
              className="ms-auto shrink-0 font-normal"
              dateTime={reply.createdAt.toISOString()}
            >
              {dateFormat.format(reply.createdAt)}
            </time>
          </MessageHeader>
          <Bubble
            className="max-w-full"
            variant={isEditor ? "default" : "muted"}
          >
            <BubbleContent className="whitespace-pre-wrap text-sm">
              {reply.body}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </li>
  );
}

// The editor marks a thread done, refuses it with a reason, or reopens it.
function StatusActions({
  comment,
  messages,
  onReject,
  onStatusChange,
}: {
  comment: FeedbackComment;
  messages: FeedbackMessages;
  onReject: () => void;
  onStatusChange: StatusHandler;
}) {
  const [pending, setPending] = useState(false);
  const change = useCallback(
    async (status: "done" | "open") => {
      setPending(true);
      try {
        await onStatusChange({ id: comment.id, status });
        toast.success(messages.statusSaved[status]);
      } catch {
        toast.error(messages.statusError);
      } finally {
        setPending(false);
      }
    },
    [comment.id, messages, onStatusChange]
  );
  const markDone = useCallback(() => change("done"), [change]);
  const reopen = useCallback(() => change("open"), [change]);

  if (comment.status !== "open") {
    return (
      <Button
        disabled={pending}
        onClick={reopen}
        size="xs"
        type="button"
        variant="outline"
      >
        <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
        {messages.reopen}
      </Button>
    );
  }
  return (
    <>
      <Button
        disabled={pending}
        onClick={markDone}
        size="xs"
        type="button"
        variant="outline"
      >
        <CheckIcon aria-hidden="true" data-icon="inline-start" />
        {messages.markDone}
      </Button>
      <Button
        disabled={pending}
        onClick={onReject}
        size="xs"
        type="button"
        variant="outline"
      >
        <XIcon aria-hidden="true" data-icon="inline-start" />
        {messages.reject}
      </Button>
    </>
  );
}

type ThreadMode = "idle" | "reject" | "reply";

function CommentItem({
  comment,
  dateFormat,
  frameRate,
  messages,
  onReply,
  onSeek,
  onStatusChange,
}: {
  comment: FeedbackComment;
  dateFormat: Intl.DateTimeFormat;
  frameRate: FrameRate;
  messages: FeedbackMessages;
  onReply?: ReplyHandler;
  onSeek: (ms: number) => void;
  onStatusChange?: StatusHandler;
}) {
  const [mode, setMode] = useState<ThreadMode>("idle");
  const handleSeek = useCallback(
    () => onSeek(comment.timecodeMs),
    [comment.timecodeMs, onSeek]
  );
  const showReply = useCallback(() => setMode("reply"), []);
  const showReject = useCallback(() => setMode("reject"), []);
  const close = useCallback(() => setMode("idle"), []);
  const sendReply = useCallback(
    async (text: string) => {
      await onReply?.(comment.id, text);
      setMode("idle");
    },
    [comment.id, onReply]
  );
  const sendReject = useCallback(
    async (text: string) => {
      await onStatusChange?.({
        id: comment.id,
        rejectReason: text,
        status: "rejected",
      });
      toast.success(messages.statusSaved.rejected);
      setMode("idle");
    },
    [comment.id, messages.statusSaved.rejected, onStatusChange]
  );

  const start = formatTimecode(comment.timecodeMs, frameRate);
  const position =
    comment.endTimecodeMs === null
      ? start
      : formatMessage(messages.range, {
          end: formatTimecode(comment.endTimecodeMs, frameRate),
          start,
        });
  const author = authorOf(comment, messages);
  return (
    <li className="flex flex-col gap-3 border-b p-3 last:border-b-0">
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
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGES[comment.status]}>
            {messages.statuses[comment.status]}
          </Badge>
          {comment.roundId === null ? (
            <Badge variant="primary-light">{messages.pending}</Badge>
          ) : null}
          <div className="ms-auto flex flex-wrap justify-end gap-2">
            {onStatusChange && mode === "idle" ? (
              <StatusActions
                comment={comment}
                messages={messages}
                onReject={showReject}
                onStatusChange={onStatusChange}
              />
            ) : null}
            {onReply && mode === "idle" ? (
              <Button
                onClick={showReply}
                size="xs"
                type="button"
                variant="ghost"
              >
                <ReplyIcon aria-hidden="true" data-icon="inline-start" />
                {messages.reply}
              </Button>
            ) : null}
          </div>
        </div>
        {comment.status === "rejected" && comment.rejectReason ? (
          <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
            {formatMessage(messages.rejectReason, {
              reason: comment.rejectReason,
            })}
          </p>
        ) : null}
      </div>
      {comment.replies.length > 0 ? (
        <ul
          aria-label={formatMessage(messages.repliesLabel, { author })}
          className="flex flex-col gap-3 border-s-2 ps-3"
        >
          {comment.replies.map((reply) => (
            <ReplyItem
              dateFormat={dateFormat}
              key={reply.id}
              messages={messages}
              reply={reply}
            />
          ))}
        </ul>
      ) : null}
      {mode === "reply" ? (
        <ThreadTextForm
          errorMessage={messages.replyError}
          label={messages.replyLabel}
          maxLength={COMMENT_BODY_MAX_LENGTH}
          messages={messages}
          onCancel={close}
          onSubmit={sendReply}
          placeholder={messages.replyPlaceholder}
          requiredMessage={messages.replyRequired}
          submitLabel={messages.replySubmit}
        />
      ) : null}
      {mode === "reject" ? (
        <ThreadTextForm
          errorMessage={messages.statusError}
          label={messages.rejectReasonLabel}
          maxLength={COMMENT_REJECT_REASON_MAX_LENGTH}
          messages={messages}
          onCancel={close}
          onSubmit={sendReject}
          placeholder={messages.rejectReasonPlaceholder}
          requiredMessage={messages.rejectReasonRequired}
          submitLabel={messages.rejectSubmit}
        />
      ) : null}
    </li>
  );
}

// The timestamped thread of a version, oldest timecode first, with replies and
// statuses (REV-03, REV-04): shared by the editor's review page, where
// onStatusChange lets the editor process feedback, and the client's review
// link. Without onReply the thread is read-only: an approved version takes
// no more replies (APPR-02).
export function CommentThread({
  comments,
  emptyDescription,
  emptyTitle,
  frameRate,
  isError,
  locale,
  messages,
  onReply,
  onRetry,
  onSeek,
  onStatusChange,
  retryLabel,
}: {
  comments: FeedbackComment[] | undefined;
  emptyDescription: string;
  emptyTitle: string;
  frameRate: FrameRate | null;
  isError: boolean;
  locale: Locale;
  messages: FeedbackMessages;
  onReply?: ReplyHandler;
  onRetry: () => void;
  onSeek: (ms: number) => void;
  onStatusChange?: StatusHandler;
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
          onReply={onReply}
          onSeek={onSeek}
          onStatusChange={onStatusChange}
        />
      ))}
    </ul>
  );
}
