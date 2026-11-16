"use client";

import {
  DELIVERABLE_MAX_DURATION_SECONDS,
  DELIVERABLE_TITLE_MAX_LENGTH,
  type DeliverableInput,
} from "@roundcut/api/deliverable";
import { DELIVERABLE_ASPECTS } from "@roundcut/db/deliverable";
import { Button } from "@roundcut/ui/components/button";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { useStore } from "@tanstack/react-form";
import { PlusIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useCallback, useMemo } from "react";
import z from "zod";

import { useAppForm } from "@/components/auth/auth-form";
import { formatMessage, type Messages } from "@/i18n/messages";

type DeliverablesMessages = Messages["projects"]["deliverables"];

export type DeliverableItem = DeliverableInput & { id: string };

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MAX_DURATION_PARTS = 3;
const DIGITS = /^\d+$/;

// Accepts plain seconds ("90"), m:ss ("1:30") or h:mm:ss ("1:02:30").
function parseDuration(value: string): number | undefined {
  const parts = value.trim().split(":");
  if (
    parts.length > MAX_DURATION_PARTS ||
    !parts.every((part) => DIGITS.test(part))
  ) {
    return;
  }
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((part) => part >= SECONDS_PER_MINUTE)) {
    return;
  }
  const seconds = numbers.reduce(
    (total, part) => total * SECONDS_PER_MINUTE + part,
    0
  );
  return seconds >= 1 && seconds <= DELIVERABLE_MAX_DURATION_SECONDS
    ? seconds
    : undefined;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

export const deliverableCountLabel = (
  messages: DeliverablesMessages,
  locale: string,
  count: number
) =>
  formatMessage(
    new Intl.PluralRules(locale).select(count) === "one"
      ? messages.countOne
      : messages.countOther,
    { count }
  );

function deliverableFormSchema(errors: DeliverablesMessages["errors"]) {
  return z.object({
    aspect: z.enum(DELIVERABLE_ASPECTS),
    duration: z.string().refine(
      (value) => value.trim() === "" || parseDuration(value) !== undefined,
      formatMessage(errors.durationInvalid, {
        max: formatDuration(DELIVERABLE_MAX_DURATION_SECONDS),
      })
    ),
    title: z
      .string()
      .trim()
      .min(1, errors.titleRequired)
      .max(
        DELIVERABLE_TITLE_MAX_LENGTH,
        formatMessage(errors.tooLong, { max: DELIVERABLE_TITLE_MAX_LENGTH })
      ),
  });
}

type DeliverableFormValues = z.input<ReturnType<typeof deliverableFormSchema>>;

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

// Not a <form>: it also lives inside the project creation form, so Enter in
// its inputs adds the deliverable instead of submitting the outer form.
export function DeliverableForm({
  limitMessage,
  messages,
  onAdd,
}: {
  limitMessage?: string;
  messages: DeliverablesMessages;
  onAdd: (deliverable: DeliverableInput) => Promise<boolean> | boolean;
}) {
  const schema = useMemo(
    () => deliverableFormSchema(messages.errors),
    [messages.errors]
  );
  const aspectOptions = useMemo(
    () =>
      DELIVERABLE_ASPECTS.map((aspect) => ({
        label: messages.aspects[aspect],
        value: aspect,
      })),
    [messages.aspects]
  );
  const defaultValues: DeliverableFormValues = {
    aspect: "16:9",
    duration: "",
    title: "",
  };

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ formApi, value: { aspect, duration, title } }) => {
      const added = await onAdd({
        aspect,
        targetDurationSeconds: parseDuration(duration) ?? null,
        title: title.trim(),
      });
      if (added) {
        formApi.reset();
      }
    },
    validators: { onSubmit: schema },
  });
  const isSubmitting = useStore(form.store, selectIsSubmitting);

  const submit = useCallback(() => {
    form.handleSubmit();
  }, [form]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        form.handleSubmit();
      }
    },
    [form]
  );

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <legend className="sr-only">{messages.formTitle}</legend>
      <form.AppForm>
        <form.AppField name="title">
          {(field) => (
            <field.TextField
              autoComplete="off"
              label={messages.title}
              onKeyDown={handleKeyDown}
              placeholder={messages.titlePlaceholder}
            />
          )}
        </form.AppField>
        <div className="grid gap-3 sm:grid-cols-2">
          <form.AppField name="aspect">
            {(field) => (
              <field.SelectField
                label={messages.aspect}
                options={aspectOptions}
              />
            )}
          </form.AppField>
          <form.AppField name="duration">
            {(field) => (
              <field.TextField
                autoComplete="off"
                inputMode="numeric"
                label={messages.duration}
                onKeyDown={handleKeyDown}
                placeholder={messages.durationPlaceholder}
              />
            )}
          </form.AppField>
        </div>
      </form.AppForm>
      <div className="flex items-center justify-end gap-3">
        {limitMessage ? (
          <p className="text-muted-foreground text-xs">{limitMessage}</p>
        ) : null}
        <Button
          disabled={isSubmitting || Boolean(limitMessage)}
          onClick={submit}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {isSubmitting ? messages.adding : messages.add}
        </Button>
      </div>
    </fieldset>
  );
}

function DeliverableRow({
  deliverable,
  messages,
  onRemove,
  position,
}: {
  deliverable: DeliverableItem;
  messages: DeliverablesMessages;
  onRemove?: (id: string) => void;
  position: number;
}) {
  const { aspect, id, targetDurationSeconds, title } = deliverable;
  const handleRemove = useCallback(() => onRemove?.(id), [id, onRemove]);
  return (
    <li className="flex min-h-11 items-center gap-3 py-2">
      <span className="w-5 shrink-0 text-muted-foreground text-xs tabular-nums">
        {position}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-sm">
        {title}
      </span>
      <Badge title={messages.aspects[aspect]} variant="outline">
        {aspect}
      </Badge>
      <span className="w-14 shrink-0 text-end text-muted-foreground text-xs tabular-nums">
        {targetDurationSeconds === null ? (
          <span className="sr-only">{messages.noDuration}</span>
        ) : (
          formatDuration(targetDurationSeconds)
        )}
      </span>
      {onRemove ? (
        <Button
          aria-label={formatMessage(messages.remove, { title })}
          onClick={handleRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

export function DeliverableList({
  deliverables,
  messages,
  onRemove,
}: {
  deliverables: DeliverableItem[];
  messages: DeliverablesMessages;
  onRemove?: (id: string) => void;
}) {
  return (
    <ol className="flex flex-col divide-y">
      {deliverables.map((deliverable, index) => (
        <DeliverableRow
          deliverable={deliverable}
          key={deliverable.id}
          messages={messages}
          onRemove={onRemove}
          position={index + 1}
        />
      ))}
    </ol>
  );
}
