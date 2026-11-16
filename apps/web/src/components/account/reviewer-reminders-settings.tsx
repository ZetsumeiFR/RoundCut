"use client";

import {
  REVIEWER_REMINDER_MAX_HOURS,
  type ReviewerReminders,
  reviewerRemindersSchema,
} from "@roundcut/api/workspace";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { formatMessage } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import type { TermsMessages } from "./revision-terms-settings";
import { SettingsCard } from "./settings-card";
import {
  SettingsAlert,
  useSettingsForm,
  useSubmitHandler,
} from "./settings-form";

const HOURS_PATTERN = /^\d{1,3}$/;

const isDelayHours = (value: string) =>
  HOURS_PATTERN.test(value.trim()) &&
  Number(value) >= 1 &&
  Number(value) <= REVIEWER_REMINDER_MAX_HOURS;

const toFormValues = (reminders: ReviewerReminders) => ({
  delayHours: String(reminders.delayHours),
  enabled: reminders.enabled,
});

// The "unsubmitted feedback" reminder sent to reviewers (ROUND-04).
export function ReviewerRemindersForm({
  messages,
  reminders,
}: {
  messages: TermsMessages;
  reminders: ReviewerReminders;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const { mutateAsync } = useMutation(
    orpc.workspace.updateReminders.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
      },
    })
  );

  const form = useSettingsForm({
    defaultValues: toFormValues(reminders),
    onSubmit: async ({ value }) => {
      setSaveError(false);
      try {
        const saved = await mutateAsync(
          reviewerRemindersSchema.parse({
            delayHours: Number(value.delayHours.trim()),
            enabled: value.enabled,
          })
        );
        form.reset(toFormValues(saved.reviewerReminders));
        toast.success(messages.reminders.saved);
      } catch {
        setSaveError(true);
      }
    },
    validators: {
      onSubmit: z.object({
        delayHours: z.string().refine(
          isDelayHours,
          formatMessage(messages.reminders.delayInvalid, {
            max: REVIEWER_REMINDER_MAX_HOURS,
          })
        ),
        enabled: z.boolean(),
      }),
    },
  });

  const handleSubmit = useSubmitHandler(form);

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      {saveError ? <SettingsAlert title={messages.saveError} /> : null}
      <form.AppForm>
        <SettingsCard
          description={messages.reminders.description}
          footer={<form.FormFooter messages={messages} />}
          title={messages.reminders.title}
        >
          <FieldGroup className="gap-0">
            <form.AppField name="enabled">
              {(field) => (
                <field.SwitchSettingField
                  description={messages.reminders.enabledDescription}
                  title={messages.reminders.enabled}
                />
              )}
            </form.AppField>
            <form.AppField name="delayHours">
              {(field) => (
                <field.TextSettingField
                  description={messages.reminders.delayDescription}
                  inputMode="numeric"
                  last
                  suffix={messages.reminders.delaySuffix}
                  title={messages.reminders.delay}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </SettingsCard>
      </form.AppForm>
    </form>
  );
}
