"use client";

import { ORPCError } from "@orpc/client";
import {
  MANUAL_CLOSE_REASONS,
  type ManualCloseReason,
  ROUND_CLOSE_NOTE_MAX_LENGTH,
} from "@roundcut/db/round";
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

type RoundsMessages = Messages["projects"]["view"]["rounds"];

interface ClosingRound {
  id: string;
  // Place in the "round n" counter (ROUND-02).
  position: number;
}

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

function CloseRoundForm({
  messages,
  onDone,
  round,
}: {
  messages: RoundsMessages;
  onDone: () => void;
  round: ClosingRound;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { close } = messages;
  const schema = useMemo(
    () =>
      z
        .object({
          note: z
            .string()
            .trim()
            .max(
              ROUND_CLOSE_NOTE_MAX_LENGTH,
              formatMessage(close.tooLong, {
                max: ROUND_CLOSE_NOTE_MAX_LENGTH,
              })
            ),
          reason: z.enum(MANUAL_CLOSE_REASONS),
        })
        .refine((value) => value.reason !== "other" || value.note.length > 0, {
          message: close.noteRequired,
          path: ["note"],
        }),
    [close]
  );
  const reasons = useMemo(
    () =>
      MANUAL_CLOSE_REASONS.map((value) => ({
        label: capitalize(messages.manualReasons[value]),
        value,
      })),
    [messages.manualReasons]
  );

  const form = useAppForm({
    defaultValues: {
      note: "",
      reason: "feedback_elsewhere" as ManualCloseReason,
    },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        await api.round.closeManually({ ...value, roundId: round.id });
        toast.success(formatMessage(close.saved, { number: round.position }));
        onDone();
      } catch (error) {
        setSaveError(
          error instanceof ORPCError && error.code === "CONFLICT"
            ? close.conflict
            : close.error
        );
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.round.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.project.key() }),
        ]);
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
        <DialogTitle>
          {formatMessage(close.title, { number: round.position })}
        </DialogTitle>
        <DialogDescription>{close.description}</DialogDescription>
      </DialogHeader>
      <form.AppForm>
        <FieldGroup className="gap-4">
          <form.AppField name="reason">
            {(field) => (
              <field.SelectField label={close.reason} options={reasons} />
            )}
          </form.AppField>
          <form.AppField name="note">
            {(field) => (
              <field.TextareaField
                description={close.noteDescription}
                label={close.note}
                maxLength={ROUND_CLOSE_NOTE_MAX_LENGTH}
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
          {close.cancel}
        </DialogClose>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? close.submitting : close.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

// The editor closes an open round by hand (ROUND-03) with a reason and a note
// the client reads on the review link.
export function CloseRoundDialog({
  messages,
  onOpenChange,
  open,
  round,
}: {
  messages: RoundsMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  round: ClosingRound;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted while open so every opening starts from fresh values. */}
        {open ? (
          <CloseRoundForm messages={messages} onDone={close} round={round} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
