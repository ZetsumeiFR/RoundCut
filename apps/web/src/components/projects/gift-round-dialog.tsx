"use client";

import { ORPCError } from "@orpc/client";
import { ROUND_GIFT_NOTE_MAX_LENGTH } from "@roundcut/db/round";
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

interface GiftedRound {
  id: string;
  // Place in the "round n" counter (ROUND-02).
  position: number;
}

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

function GiftRoundForm({
  messages,
  onDone,
  round,
}: {
  messages: RoundsMessages;
  onDone: () => void;
  round: GiftedRound;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { gift } = messages;
  const schema = useMemo(
    () =>
      z.object({
        note: z
          .string()
          .trim()
          .max(
            ROUND_GIFT_NOTE_MAX_LENGTH,
            formatMessage(gift.tooLong, { max: ROUND_GIFT_NOTE_MAX_LENGTH })
          ),
      }),
    [gift]
  );

  const form = useAppForm({
    defaultValues: { note: "" },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        await api.round.giftExtra({ ...value, roundId: round.id });
        toast.success(formatMessage(gift.saved, { number: round.position }));
        onDone();
      } catch (error) {
        setSaveError(
          error instanceof ORPCError && error.code === "CONFLICT"
            ? gift.conflict
            : gift.error
        );
      } finally {
        await queryClient.invalidateQueries({ queryKey: orpc.round.key() });
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
          {formatMessage(gift.title, { number: round.position })}
        </DialogTitle>
        <DialogDescription>{gift.description}</DialogDescription>
      </DialogHeader>
      <form.AppForm>
        <FieldGroup className="gap-4">
          <form.AppField name="note">
            {(field) => (
              <field.TextareaField
                description={gift.noteDescription}
                label={gift.note}
                maxLength={ROUND_GIFT_NOTE_MAX_LENGTH}
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
          {gift.cancel}
        </DialogClose>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? gift.submitting : gift.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

// The editor offers an open round beyond the included ones for free
// (ROUND-06), with an optional message the client reads on the review link.
export function GiftRoundDialog({
  messages,
  onOpenChange,
  open,
  round,
}: {
  messages: RoundsMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  round: GiftedRound;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted while open so every opening starts from fresh values. */}
        {open ? (
          <GiftRoundForm messages={messages} onDone={close} round={round} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
