"use client";

import {
  CLIENT_ADDRESS_MAX_LENGTH,
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_REVIEWERS_MAX,
  isSiren,
  normalizeSiren,
  splitEmails,
} from "@roundcut/api/client";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import { Button } from "@roundcut/ui/components/button";
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@roundcut/ui/components/field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@roundcut/ui/components/sheet";
import { useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, PencilIcon, XIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type ClientsMessages = Messages["clients"];

export type Client = Awaited<
  ReturnType<AppRouterClient["client"]["list"]>
>[number];

export type ClientSheetState =
  | { mode: "create" }
  | { clientId: string; mode: "view" }
  | { clientId: string; fromView: boolean; mode: "edit" };

const emailSchema = z.email();
const isEmail = (value: string) => emailSchema.safeParse(value).success;

const SIREN_GROUPS = /(\d{3})(?=\d)/g;

export const formatSiren = (siren: string) =>
  siren.replace(SIREN_GROUPS, "$1 ");

function clientFormSchema(errors: ClientsMessages["form"]["errors"]) {
  const text = (max: number) =>
    z.string().trim().max(max, formatMessage(errors.tooLong, { max }));

  return z.object({
    address: text(CLIENT_ADDRESS_MAX_LENGTH),
    deciderEmail: z.string().trim().refine(isEmail, errors.emailInvalid),
    deciderName: text(CLIENT_NAME_MAX_LENGTH).min(
      1,
      errors.deciderNameRequired
    ),
    name: text(CLIENT_NAME_MAX_LENGTH).min(1, errors.nameRequired),
    notes: text(CLIENT_NOTES_MAX_LENGTH),
    reviewerEmails: z.string().superRefine((value, context) => {
      const emails = splitEmails(value);
      const invalid = emails.filter((email) => !isEmail(email));
      if (invalid.length > 0) {
        context.addIssue({
          code: "custom",
          message: formatMessage(errors.reviewerEmailsInvalid, {
            emails: invalid.join(", "),
          }),
        });
      }
      if (emails.length > CLIENT_REVIEWERS_MAX) {
        context.addIssue({
          code: "custom",
          message: formatMessage(errors.reviewersMax, {
            max: CLIENT_REVIEWERS_MAX,
          }),
        });
      }
    }),
    siren: z.string().refine((value) => {
      const siren = normalizeSiren(value);
      return siren === "" || isSiren(siren);
    }, errors.sirenInvalid),
  });
}

type ClientFormValues = z.input<ReturnType<typeof clientFormSchema>>;

const formValuesOf = (client: Client | null): ClientFormValues => ({
  address: client?.address ?? "",
  deciderEmail: client?.deciderEmail ?? "",
  deciderName: client?.deciderName ?? "",
  name: client?.name ?? "",
  notes: client?.notes ?? "",
  reviewerEmails: client?.reviewerEmails.join("\n") ?? "",
  siren: client?.siren ? formatSiren(client.siren) : "",
});

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

function SheetCloseButton({ label }: { label: string }) {
  return (
    <SheetClose
      render={
        <Button
          className="absolute top-3 right-3"
          size="icon-sm"
          variant="ghost"
        />
      }
    >
      <XIcon aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </SheetClose>
  );
}

function ClientForm({
  client,
  messages,
  onCancel,
  onSaved,
}: {
  client: Client | null;
  messages: ClientsMessages;
  onCancel: () => void;
  onSaved: (saved: Client, created: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const { form: formMessages } = messages;
  const schema = useMemo(
    () => clientFormSchema(formMessages.errors),
    [formMessages.errors]
  );

  const form = useAppForm({
    defaultValues: formValuesOf(client),
    onSubmit: async ({ value }) => {
      setSaveError(false);
      const input = {
        ...value,
        reviewerEmails: splitEmails(value.reviewerEmails),
      };
      try {
        const saved = client
          ? await api.client.update({ ...input, id: client.id })
          : await api.client.create(input);
        await queryClient.invalidateQueries({
          queryKey: orpc.client.list.queryKey(),
        });
        onSaved(saved, client === null);
      } catch {
        setSaveError(true);
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

  const title = client
    ? formatMessage(formMessages.editTitle, { name: client.name })
    : formMessages.createTitle;
  const description = client
    ? formMessages.editDescription
    : formMessages.createDescription;
  const submitLabel = client ? formMessages.save : formMessages.create;
  const submitText = isSubmitting ? formMessages.saving : submitLabel;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit}
    >
      <SheetHeader className="gap-1 border-b px-5 py-4 pr-12">
        <SheetTitle className="text-base">{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        {saveError ? (
          <AuthErrorAlert
            message={formMessages.saveError}
            title={messages.actionError}
          />
        ) : null}
        <form.AppForm>
          <FieldGroup className="gap-4">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  autoComplete="organization"
                  label={formMessages.name}
                  placeholder={formMessages.namePlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField name="deciderName">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  label={formMessages.deciderName}
                  placeholder={formMessages.deciderNamePlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField name="deciderEmail">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  label={formMessages.deciderEmail}
                  placeholder={formMessages.deciderEmailPlaceholder}
                  type="email"
                />
              )}
            </form.AppField>
            <form.AppField name="reviewerEmails">
              {(field) => (
                <field.TextareaField
                  description={formMessages.reviewerEmailsHint}
                  label={formMessages.reviewerEmails}
                  placeholder={formMessages.reviewerEmailsPlaceholder}
                  rows={3}
                />
              )}
            </form.AppField>
            <form.AppField name="notes">
              {(field) => (
                <field.TextareaField
                  label={formMessages.notes}
                  placeholder={formMessages.notesPlaceholder}
                  rows={3}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <FieldSet className="gap-4">
            <FieldLegend variant="label">
              {formMessages.billingSection}
            </FieldLegend>
            <form.AppField name="siren">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  inputMode="numeric"
                  label={formMessages.siren}
                  placeholder={formMessages.sirenPlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField name="address">
              {(field) => (
                <field.TextareaField
                  autoComplete="street-address"
                  label={formMessages.address}
                  placeholder={formMessages.addressPlaceholder}
                  rows={2}
                />
              )}
            </form.AppField>
          </FieldSet>
        </form.AppForm>
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
        <Button onClick={onCancel} type="button" variant="outline">
          {messages.cancel}
        </Button>
        <Button disabled={isSubmitting} type="submit">
          {submitText}
        </Button>
      </SheetFooter>
    </form>
  );
}

function DetailRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function OptionalText({ none, value }: { none: string; value: string | null }) {
  return value ? (
    <span className="whitespace-pre-wrap break-words">{value}</span>
  ) : (
    <span className="text-muted-foreground">{none}</span>
  );
}

function ClientDetails({
  client,
  messages,
  onArchive,
  onEdit,
}: {
  client: Client;
  messages: ClientsMessages;
  onArchive: (client: Client) => void;
  onEdit: () => void;
}) {
  const { details } = messages;
  const handleArchive = useCallback(
    () => onArchive(client),
    [client, onArchive]
  );

  return (
    <>
      <SheetHeader className="gap-1 border-b px-5 py-4 pr-12">
        <SheetTitle className="truncate text-base">{client.name}</SheetTitle>
        <SheetDescription className="truncate">
          {client.deciderName} · {client.deciderEmail}
        </SheetDescription>
      </SheetHeader>
      <dl className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <DetailRow label={details.decider}>
          <span className="flex flex-col gap-0.5">
            <span>{client.deciderName}</span>
            <a
              className="w-fit break-all text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              href={`mailto:${client.deciderEmail}`}
            >
              {client.deciderEmail}
            </a>
          </span>
        </DetailRow>
        <DetailRow label={details.reviewers}>
          {client.reviewerEmails.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {client.reviewerEmails.map((email) => (
                <li className="break-all" key={email}>
                  {email}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">{messages.none}</span>
          )}
        </DetailRow>
        <DetailRow label={details.notes}>
          <OptionalText none={messages.none} value={client.notes} />
        </DetailRow>
        <DetailRow label={details.siren}>
          <OptionalText
            none={messages.none}
            value={client.siren ? formatSiren(client.siren) : null}
          />
        </DetailRow>
        <DetailRow label={details.address}>
          <OptionalText none={messages.none} value={client.address} />
        </DetailRow>
      </dl>
      <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
        <Button onClick={handleArchive} type="button" variant="outline">
          <ArchiveIcon aria-hidden="true" data-icon="inline-start" />
          {messages.archive.action}
        </Button>
        <Button onClick={onEdit} type="button">
          <PencilIcon aria-hidden="true" data-icon="inline-start" />
          {messages.edit}
        </Button>
      </SheetFooter>
    </>
  );
}

function SheetBody({
  client,
  messages,
  onArchive,
  onOpenChange,
  onStateChange,
  state,
}: {
  client: Client | null;
  messages: ClientsMessages;
  onArchive: (client: Client) => void;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: ClientSheetState) => void;
  state: ClientSheetState;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const backOrClose = useCallback(() => {
    if (state.mode === "edit" && state.fromView) {
      onStateChange({ clientId: state.clientId, mode: "view" });
      return;
    }
    close();
  }, [close, onStateChange, state]);

  const handleSaved = useCallback(
    (saved: Client, created: boolean) => {
      const template = created
        ? messages.saved.created
        : messages.saved.updated;
      toast.success(formatMessage(template, { name: saved.name }));
      backOrClose();
    },
    [backOrClose, messages.saved]
  );

  const openEdit = useCallback(() => {
    if (client) {
      onStateChange({ clientId: client.id, fromView: true, mode: "edit" });
    }
  }, [client, onStateChange]);

  if (state.mode === "create") {
    return (
      <ClientForm
        client={null}
        messages={messages}
        onCancel={close}
        onSaved={handleSaved}
      />
    );
  }
  if (!client) {
    return null;
  }
  if (state.mode === "edit") {
    return (
      <ClientForm
        client={client}
        key={client.id}
        messages={messages}
        onCancel={backOrClose}
        onSaved={handleSaved}
      />
    );
  }
  return (
    <ClientDetails
      client={client}
      messages={messages}
      onArchive={onArchive}
      onEdit={openEdit}
    />
  );
}

export function ClientSheet({
  clients,
  messages,
  onArchive,
  onOpenChange,
  onStateChange,
  open,
  state,
}: {
  clients: Client[];
  messages: ClientsMessages;
  onArchive: (client: Client) => void;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: ClientSheetState) => void;
  open: boolean;
  state: ClientSheetState | null;
}) {
  const client =
    state && state.mode !== "create"
      ? (clients.find((candidate) => candidate.id === state.clientId) ?? null)
      : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full gap-0 sm:max-w-md"
        showCloseButton={false}
      >
        {state ? (
          <SheetBody
            client={client}
            messages={messages}
            onArchive={onArchive}
            onOpenChange={onOpenChange}
            onStateChange={onStateChange}
            state={state}
          />
        ) : null}
        <SheetCloseButton label={messages.close} />
      </SheetContent>
    </Sheet>
  );
}
