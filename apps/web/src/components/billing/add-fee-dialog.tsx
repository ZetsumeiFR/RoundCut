"use client";

import {
  BILLABLE_LINE_LABEL_MAX_LENGTH,
  BILLABLE_LINE_MAX_QUANTITY,
} from "@roundcut/api/billing";
import type { Locale } from "@roundcut/auth/locale";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { toPriceCents } from "@/components/account/revision-terms-settings";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import { FLAT_FEE_MAX, isFlatFee } from "@/components/projects/project-sheet";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type FeeMessages = Messages["billing"]["fee"];

const QUANTITY_PATTERN = /^\d{1,4}$/;

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

const isQuantity = (value: string) =>
  QUANTITY_PATTERN.test(value.trim()) &&
  Number(value) >= 1 &&
  Number(value) <= BILLABLE_LINE_MAX_QUANTITY;

function feeFormSchema(messages: FeeMessages, locale: Locale) {
  return z.object({
    label: z
      .string()
      .trim()
      .min(1, messages.labelRequired)
      .max(
        BILLABLE_LINE_LABEL_MAX_LENGTH,
        formatMessage(messages.tooLong, { max: BILLABLE_LINE_LABEL_MAX_LENGTH })
      ),
    projectId: z.string().min(1, messages.projectRequired),
    quantity: z.string().refine(
      isQuantity,
      formatMessage(messages.quantityInvalid, {
        max: BILLABLE_LINE_MAX_QUANTITY,
      })
    ),
    unitPrice: z.string().refine(
      (value) => value.trim() !== "" && isFlatFee(value),
      formatMessage(messages.priceInvalid, {
        max: new Intl.NumberFormat(locale).format(FLAT_FEE_MAX),
      })
    ),
  });
}

function AddFeeForm({
  currency,
  locale,
  messages,
  onDone,
  projects,
}: {
  currency: string;
  locale: Locale;
  messages: FeeMessages;
  onDone: () => void;
  projects: Array<{ label: string; value: string }>;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const schema = useMemo(
    () => feeFormSchema(messages, locale),
    [locale, messages]
  );

  const form = useAppForm({
    defaultValues: { label: "", projectId: "", quantity: "1", unitPrice: "" },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        await api.billing.lines.createManual({
          label: value.label,
          projectId: value.projectId,
          quantity: Number(value.quantity),
          unitPriceCents: toPriceCents(value.unitPrice),
        });
        toast.success(messages.saved);
        onDone();
      } catch {
        setSaveError(messages.error);
      } finally {
        await queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
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
        <DialogTitle>{messages.title}</DialogTitle>
        <DialogDescription>
          {formatMessage(messages.description, { currency })}
        </DialogDescription>
      </DialogHeader>
      <form.AppForm>
        <FieldGroup className="gap-4">
          <form.AppField name="projectId">
            {(field) => (
              <field.SelectField label={messages.project} options={projects} />
            )}
          </form.AppField>
          <form.AppField name="label">
            {(field) => (
              <field.TextField
                label={messages.label}
                maxLength={BILLABLE_LINE_LABEL_MAX_LENGTH}
                placeholder={messages.labelPlaceholder}
              />
            )}
          </form.AppField>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="quantity">
              {(field) => (
                <field.TextField
                  inputMode="numeric"
                  label={messages.quantity}
                />
              )}
            </form.AppField>
            <form.AppField name="unitPrice">
              {(field) => (
                <field.TextField
                  inputMode="decimal"
                  label={messages.unitPrice}
                  suffix={currency}
                />
              )}
            </form.AppField>
          </div>
        </FieldGroup>
      </form.AppForm>
      {saveError ? (
        <AuthErrorAlert message={saveError} title={saveError} />
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {messages.cancel}
        </DialogClose>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? messages.submitting : messages.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

// A fee the editor bills by hand with one of their projects (BILL-01).
export function AddFeeDialog({
  currency,
  locale,
  messages,
  onOpenChange,
  open,
}: {
  currency: string;
  locale: Locale;
  messages: FeeMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { data } = useQuery({
    ...orpc.project.list.queryOptions(),
    enabled: open,
  });
  const projects = useMemo(
    () =>
      (data ?? []).map((project) => ({
        label: `${project.name} · ${project.client.name}`,
        value: project.id,
      })),
    [data]
  );

  let body: ReactNode = null;
  if (open && data?.length === 0) {
    body = (
      <DialogHeader>
        <DialogTitle>{messages.title}</DialogTitle>
        <DialogDescription>{messages.noProjects}</DialogDescription>
      </DialogHeader>
    );
  } else if (open && data) {
    // Mounted while open so every opening starts from fresh values.
    body = (
      <AddFeeForm
        currency={currency}
        locale={locale}
        messages={messages}
        onDone={close}
        projects={projects}
      />
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">{body}</DialogContent>
    </Dialog>
  );
}
