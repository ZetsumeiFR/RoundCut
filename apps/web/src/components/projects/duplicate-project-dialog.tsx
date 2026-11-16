"use client";

import { PROJECT_NAME_MAX_LENGTH } from "@roundcut/api/project";
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
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { deliverableCountLabel } from "./deliverable-form";

type ProjectsMessages = Messages["projects"];

interface DuplicateSource {
  deliverables: readonly unknown[];
  id: string;
  name: string;
}

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

// Suggests "<source> (copy)", shortening the source name so the suffix fits.
const suggestName = (template: string, name: string) => {
  const suffixLength = formatMessage(template, { name: "" }).length;
  return formatMessage(template, {
    name: name.slice(0, PROJECT_NAME_MAX_LENGTH - suffixLength),
  });
};

function DuplicateForm({
  locale,
  messages,
  onDone,
  source,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  onDone: () => void;
  source: DuplicateSource;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [saveError, setSaveError] = useState(false);
  const { duplicate, form: formMessages } = messages;
  const schema = useMemo(
    () =>
      z.object({
        copyDeliverables: z.boolean(),
        name: z
          .string()
          .trim()
          .min(1, formMessages.errors.nameRequired)
          .max(
            PROJECT_NAME_MAX_LENGTH,
            formatMessage(formMessages.errors.tooLong, {
              max: PROJECT_NAME_MAX_LENGTH,
            })
          ),
      }),
    [formMessages.errors]
  );

  const form = useAppForm({
    defaultValues: {
      copyDeliverables: false,
      name: suggestName(duplicate.defaultName, source.name),
    },
    onSubmit: async ({ value }) => {
      setSaveError(false);
      try {
        const created = await api.project.duplicate({
          ...value,
          id: source.id,
        });
        await queryClient.invalidateQueries({ queryKey: orpc.project.key() });
        toast.success(
          formatMessage(duplicate.saved, {
            name: created.name,
            source: source.name,
          })
        );
        onDone();
        router.push(`/projects/${created.id}`);
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
  const deliverableCount = source.deliverables.length;

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{duplicate.title}</DialogTitle>
        <DialogDescription>
          {formatMessage(duplicate.description, { name: source.name })}
        </DialogDescription>
      </DialogHeader>
      <form.AppForm>
        <FieldGroup className="gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                autoComplete="off"
                label={duplicate.name}
                maxLength={PROJECT_NAME_MAX_LENGTH}
              />
            )}
          </form.AppField>
          {deliverableCount > 0 ? (
            <form.AppField name="copyDeliverables">
              {(field) => (
                <field.SwitchField
                  description={formatMessage(
                    duplicate.copyDeliverablesDescription,
                    {
                      count: deliverableCountLabel(
                        messages.deliverables,
                        locale,
                        deliverableCount
                      ),
                    }
                  )}
                  label={duplicate.copyDeliverables}
                />
              )}
            </form.AppField>
          ) : null}
        </FieldGroup>
      </form.AppForm>
      {saveError ? (
        <AuthErrorAlert message={duplicate.error} title={duplicate.error} />
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {messages.cancel}
        </DialogClose>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? duplicate.submitting : duplicate.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DuplicateProjectDialog({
  locale,
  messages,
  onOpenChange,
  open,
  source,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  source: DuplicateSource;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted while open so every opening starts from fresh values. */}
        {open ? (
          <DuplicateForm
            locale={locale}
            messages={messages}
            onDone={close}
            source={source}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
