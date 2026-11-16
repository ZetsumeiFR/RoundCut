"use client";

import {
  PASTED_COMMENTS_MAX,
  type PastedLine,
  parsePastedFeedback,
} from "@roundcut/api/comment";
import { type FrameRate, formatTimecode } from "@roundcut/api/timecode";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { Field, FieldError, FieldLabel } from "@roundcut/ui/components/field";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { Textarea } from "@roundcut/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardPasteIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { FALLBACK_FRAME_RATE } from "./video-player";

type PasteMessages = Messages["review"]["comments"]["paste"];

function PastedLineItem({
  frameRate,
  item,
  messages,
}: {
  frameRate: FrameRate;
  item: PastedLine;
  messages: PasteMessages;
}) {
  if (item.kind === "comment") {
    return (
      <li className="flex min-w-0 items-baseline gap-2 px-2 py-1.5 text-sm">
        <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
          {formatTimecode(item.timecodeMs, frameRate)}
        </span>
        <span className="min-w-0 break-words">{item.body}</span>
      </li>
    );
  }
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1.5 text-sm">
      <Badge variant="warning-light">{messages.reasons[item.reason]}</Badge>
      <span className="min-w-0 break-words text-muted-foreground line-through">
        {item.text}
      </span>
    </li>
  );
}

// Feedback already written elsewhere (an email, a chat) pasted in one go on
// the client's review link (REV-09): every "00:41 - musique moins forte" line
// becomes a timestamped comment, the others are shown as ignored.
export function PasteFeedback({
  durationMs,
  frameRate: declaredFrameRate,
  locale,
  messages,
  token,
  versionId,
}: {
  durationMs: number | null;
  frameRate: FrameRate | null;
  locale: Locale;
  messages: PasteMessages;
  token: string;
  versionId: string;
}) {
  const frameRate = declaredFrameRate ?? FALLBACK_FRAME_RATE;
  const ids = useId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const lines = useMemo(
    () => parsePastedFeedback(text, { durationMs, frameRate }),
    [durationMs, frameRate, text]
  );
  const comments = useMemo(
    () => lines.filter((item) => item.kind === "comment"),
    [lines]
  );
  const ignoredCount = lines.length - comments.length;
  const tooMany = comments.length > PASTED_COMMENTS_MAX;

  const plural = useMemo(() => new Intl.PluralRules(locale), [locale]);
  const count = useCallback(
    (value: number, one: string, other: string) =>
      formatMessage(plural.select(value) === "one" ? one : other, {
        count: value,
      }),
    [plural]
  );

  const toggle = useCallback(() => setOpen((current) => !current), []);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value),
    []
  );
  const handleCancel = useCallback(() => {
    setText("");
    setOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (comments.length === 0 || tooMany) {
        return;
      }
      setSubmitting(true);
      try {
        const { count: created } = await api.comment.createBatch({
          comments: comments.map(({ body, timecodeMs }) => ({
            body,
            timecodeMs,
          })),
          token,
          versionId,
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.comment.listForReview.key(),
          }),
          queryClient.invalidateQueries({ queryKey: orpc.review.round.key() }),
          queryClient.invalidateQueries({
            queryKey: orpc.extraRound.getOffer.key(),
          }),
        ]);
        toast.success(count(created, messages.savedOne, messages.savedOther));
        setText("");
        setOpen(false);
      } catch {
        toast.error(messages.error);
      } finally {
        setSubmitting(false);
      }
    },
    [
      comments,
      count,
      messages.error,
      messages.savedOne,
      messages.savedOther,
      queryClient,
      token,
      tooMany,
      versionId,
    ]
  );

  const panelId = `${ids}-panel`;
  const textId = `${ids}-text`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const summary = [
    count(comments.length, messages.recognizedOne, messages.recognizedOther),
    ignoredCount > 0
      ? count(ignoredCount, messages.ignoredOne, messages.ignoredOther)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-controls={panelId}
        aria-expanded={open}
        className="pointer-coarse:h-9 self-start"
        onClick={toggle}
        size="sm"
        type="button"
        variant="outline"
      >
        <ClipboardPasteIcon aria-hidden="true" data-icon="inline-start" />
        {messages.open}
      </Button>
      {open ? (
        <form
          className="flex flex-col gap-3 border p-3"
          id={panelId}
          noValidate
          onSubmit={handleSubmit}
        >
          <h2 className="font-medium text-sm">{messages.title}</h2>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={textId}>{messages.label}</FieldLabel>
            <Textarea
              aria-describedby={tooMany ? `${hintId} ${errorId}` : hintId}
              aria-invalid={tooMany ? true : undefined}
              className="min-h-28 font-mono text-sm md:text-sm"
              id={textId}
              onChange={handleChange}
              placeholder={messages.placeholder}
              spellCheck={false}
              value={text}
            />
            <p className="text-muted-foreground text-xs" id={hintId}>
              {messages.hint}
            </p>
            {tooMany ? (
              <FieldError id={errorId}>
                {formatMessage(messages.tooMany, { max: PASTED_COMMENTS_MAX })}
              </FieldError>
            ) : null}
          </Field>
          {lines.length > 0 ? (
            <section
              aria-label={messages.preview}
              className="flex flex-col gap-1.5"
            >
              <p aria-live="polite" className="font-medium text-xs">
                {summary}
              </p>
              <ul className="max-h-64 divide-y overflow-y-auto border">
                {lines.map((item) => (
                  <PastedLineItem
                    frameRate={frameRate}
                    item={item}
                    key={item.line}
                    messages={messages}
                  />
                ))}
              </ul>
            </section>
          ) : (
            <p className="border border-dashed p-3 text-center text-muted-foreground text-xs">
              {messages.empty}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              className="pointer-coarse:h-9"
              disabled={submitting}
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              {messages.cancel}
            </Button>
            <Button
              className="pointer-coarse:h-9"
              disabled={submitting || comments.length === 0 || tooMany}
              size="sm"
              type="submit"
            >
              {submitting
                ? messages.submitting
                : count(
                    comments.length,
                    messages.submitOne,
                    messages.submitOther
                  )}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
