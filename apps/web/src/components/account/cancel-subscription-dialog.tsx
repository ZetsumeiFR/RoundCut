"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
import {
  CANCELLATION_COMMENT_MAX_LENGTH,
  CANCELLATION_REASONS,
  type CancellationReason,
  type Plan,
} from "@roundcut/db/plan";
import { Button } from "@roundcut/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@roundcut/ui/components/dialog";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type SubscriptionMessages = Messages["account"]["subscription"];

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

const formatDate = (value: Date | string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(value)
  );

function CancelSubscriptionForm({
  locale,
  messages,
  onDone,
  plan,
  renewsAt,
}: {
  locale: Locale;
  messages: SubscriptionMessages;
  onDone: () => void;
  plan: Plan;
  renewsAt: Date | null;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { cancel } = messages;
  const schema = useMemo(
    () =>
      z.object({
        comment: z
          .string()
          .trim()
          .max(
            CANCELLATION_COMMENT_MAX_LENGTH,
            formatMessage(cancel.tooLong, {
              max: CANCELLATION_COMMENT_MAX_LENGTH,
            })
          ),
        reason: z.enum(CANCELLATION_REASONS),
      }),
    [cancel]
  );
  const reasons = useMemo(
    () =>
      CANCELLATION_REASONS.map((value) => ({
        label: cancel.reasons[value],
        value,
      })),
    [cancel.reasons]
  );

  const form = useAppForm({
    defaultValues: {
      comment: "",
      reason: "too_expensive" as CancellationReason,
    },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        const { cancelAt } = await api.subscription.cancel(value);
        toast.success(
          formatMessage(cancel.saved, {
            date: cancelAt ? formatDate(cancelAt, locale) : "—",
          })
        );
        onDone();
      } catch (error) {
        setSaveError(
          error instanceof ORPCError && error.code === "CONFLICT"
            ? cancel.conflict
            : cancel.error
        );
      } finally {
        await queryClient.invalidateQueries({
          queryKey: orpc.subscription.key(),
        });
      }
    },
    validators: { onSubmit: schema },
  });

  const isSubmitting = useStore(form.store, selectIsSubmitting);
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{cancel.title}</DialogTitle>
        <DialogDescription>
          {formatMessage(cancel.description, {
            date: renewsAt ? formatDate(renewsAt, locale) : "—",
            plan: messages.plans[plan].name,
          })}
        </DialogDescription>
      </DialogHeader>
      <form.AppForm>
        <FieldGroup className="gap-4">
          <form.AppField name="reason">
            {(field) => (
              <field.SelectField label={cancel.reason} options={reasons} />
            )}
          </form.AppField>
          <form.AppField name="comment">
            {(field) => (
              <field.TextareaField
                description={cancel.commentDescription}
                label={cancel.comment}
                maxLength={CANCELLATION_COMMENT_MAX_LENGTH}
                rows={3}
              />
            )}
          </form.AppField>
        </FieldGroup>
      </form.AppForm>
      {saveError ? (
        <AuthErrorAlert message={saveError} title={saveError} />
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {cancel.keep}
        </DialogClose>
        <Button disabled={isSubmitting} type="submit" variant="destructive">
          {isSubmitting ? cancel.submitting : cancel.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

// The owner cancels the subscription at the end of the paid period
// (SUB-03, base @reui/dialog-3), telling why.
export function CancelSubscriptionDialog({
  locale,
  messages,
  onOpenChange,
  open,
  plan,
  renewsAt,
}: {
  locale: Locale;
  messages: SubscriptionMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  plan: Plan;
  renewsAt: Date | null;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted while open so every opening starts from fresh values. */}
        {open ? (
          <CancelSubscriptionForm
            locale={locale}
            messages={messages}
            onDone={close}
            plan={plan}
            renewsAt={renewsAt}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
