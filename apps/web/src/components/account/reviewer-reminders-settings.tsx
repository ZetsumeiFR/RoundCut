"use client";

import {
  DECIDER_REMINDER_MAX_DAYS,
  DECIDER_REMINDER_MAX_SENDS,
  type DeciderReminders,
  deciderRemindersSchema,
  REVIEWER_REMINDER_MAX_HOURS,
  type ReviewerReminders,
  reviewerRemindersSchema,
} from "@roundcut/api/workspace";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
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

const DELAY_PATTERN = /^\d{1,3}$/;

type ReminderMessages = TermsMessages["reminders"];

interface ReminderSettings {
  delay: number;
  enabled: boolean;
}

const toFormValues = (reminder: ReminderSettings) => ({
  delay: String(reminder.delay),
  enabled: reminder.enabled,
});

// An automatic reminder email: on/off and its delay, in hours or days.
function ReminderForm({
  max,
  messages,
  reminder,
  save,
  termsMessages,
}: {
  max: number;
  messages: ReminderMessages;
  reminder: ReminderSettings;
  save: (reminder: ReminderSettings) => Promise<ReminderSettings>;
  termsMessages: TermsMessages;
}) {
  const [saveError, setSaveError] = useState(false);
  const isDelay = (value: string) =>
    DELAY_PATTERN.test(value.trim()) &&
    Number(value) >= 1 &&
    Number(value) <= max;

  const form = useSettingsForm({
    defaultValues: toFormValues(reminder),
    onSubmit: async ({ value }) => {
      setSaveError(false);
      try {
        const saved = await save({
          delay: Number(value.delay.trim()),
          enabled: value.enabled,
        });
        form.reset(toFormValues(saved));
        toast.success(messages.saved);
      } catch {
        setSaveError(true);
      }
    },
    validators: {
      onSubmit: z.object({
        delay: z
          .string()
          .refine(isDelay, formatMessage(messages.delayInvalid, { max })),
        enabled: z.boolean(),
      }),
    },
  });

  const handleSubmit = useSubmitHandler(form);

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      {saveError ? <SettingsAlert title={termsMessages.saveError} /> : null}
      <form.AppForm>
        <SettingsCard
          description={messages.description}
          footer={<form.FormFooter messages={termsMessages} />}
          title={messages.title}
        >
          <FieldGroup className="gap-0">
            <form.AppField name="enabled">
              {(field) => (
                <field.SwitchSettingField
                  description={messages.enabledDescription}
                  title={messages.enabled}
                />
              )}
            </form.AppField>
            <form.AppField name="delay">
              {(field) => (
                <field.TextSettingField
                  description={messages.delayDescription}
                  inputMode="numeric"
                  last
                  suffix={messages.delaySuffix}
                  title={messages.delay}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </SettingsCard>
      </form.AppForm>
    </form>
  );
}

// The "unsubmitted feedback" reminder sent to reviewers (ROUND-04).
export function ReviewerRemindersForm({
  messages,
  reminders,
}: {
  messages: TermsMessages;
  reminders: ReviewerReminders;
}) {
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation(
    orpc.workspace.updateReminders.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
      },
    })
  );
  const save = useCallback(
    async ({ delay, enabled }: ReminderSettings) => {
      const saved = await mutateAsync(
        reviewerRemindersSchema.parse({ delayHours: delay, enabled })
      );
      return {
        delay: saved.reviewerReminders.delayHours,
        enabled: saved.reviewerReminders.enabled,
      };
    },
    [mutateAsync]
  );

  return (
    <ReminderForm
      max={REVIEWER_REMINDER_MAX_HOURS}
      messages={messages.reminders}
      reminder={{ delay: reminders.delayHours, enabled: reminders.enabled }}
      save={save}
      termsMessages={messages}
    />
  );
}

// The "version awaiting your feedback" reminder sent to the client's decider
// (ROUND-05).
export function DeciderRemindersForm({
  messages,
  reminders,
}: {
  messages: TermsMessages;
  reminders: DeciderReminders;
}) {
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation(
    orpc.workspace.updateDeciderReminders.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
      },
    })
  );
  const save = useCallback(
    async ({ delay, enabled }: ReminderSettings) => {
      const saved = await mutateAsync(
        deciderRemindersSchema.parse({ delayDays: delay, enabled })
      );
      return {
        delay: saved.deciderReminders.delayDays,
        enabled: saved.deciderReminders.enabled,
      };
    },
    [mutateAsync]
  );

  return (
    <ReminderForm
      max={DECIDER_REMINDER_MAX_DAYS}
      messages={{
        ...messages.deciderReminders,
        enabledDescription: formatMessage(
          messages.deciderReminders.enabledDescription,
          { max: DECIDER_REMINDER_MAX_SENDS }
        ),
      }}
      reminder={{ delay: reminders.delayDays, enabled: reminders.enabled }}
      save={save}
      termsMessages={messages}
    />
  );
}
