"use client";

import {
  isTimeZone,
  WORKSPACE_CURRENCIES,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceSettingsSchema,
} from "@roundcut/api/workspace";
import { LOCALES, type Locale } from "@roundcut/auth/locale";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { BrandingSettings } from "./branding-settings";
import { SettingsCard } from "./settings-card";
import {
  SettingsAlert,
  SettingsLoadError,
  useSettingsForm,
  useSubmitHandler,
} from "./settings-form";
import { SETTING_ROWS, SettingsSkeleton } from "./settings-skeleton";

type WorkspaceMessages = Messages["account"]["workspace"];

interface Workspace {
  currency: string;
  defaultVatRate: number;
  locale: string;
  name: string;
  timezone: string;
}

interface FormValues {
  currency: string;
  defaultVatRate: string;
  locale: string;
  name: string;
  timezone: string;
}

const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

const VAT_RATE_PATTERN = /^\d{1,3}(?:[.,]\d{1,2})?$/;
const MAX_VAT_RATE = 100;

export const parseVatRate = (value: string) =>
  Number(value.trim().replace(",", "."));

export const isVatRate = (value: string) =>
  VAT_RATE_PATTERN.test(value.trim()) && parseVatRate(value) <= MAX_VAT_RATE;

const createFormSchema = (messages: WorkspaceMessages) =>
  z.object({
    currency: z.string(),
    defaultVatRate: z.string().refine(isVatRate, messages.vatRateInvalid),
    locale: z.string(),
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(
        WORKSPACE_NAME_MAX_LENGTH,
        formatMessage(messages.nameTooLong, { max: WORKSPACE_NAME_MAX_LENGTH })
      ),
    timezone: z.string().refine(isTimeZone),
  });

export const formatVatRate = (rate: number, locale: Locale) =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(rate);

const toFormValues = (workspace: Workspace, locale: Locale): FormValues => ({
  currency: workspace.currency,
  defaultVatRate: formatVatRate(workspace.defaultVatRate, locale),
  locale: workspace.locale,
  name: workspace.name,
  timezone: workspace.timezone,
});

export function useWorkspaceOptions(locale: Locale, timezone: string) {
  return useMemo(() => {
    const currencyNames = new Intl.DisplayNames([locale], { type: "currency" });
    const timezones = Intl.supportedValuesOf("timeZone");
    if (!timezones.includes(timezone)) {
      timezones.unshift(timezone);
    }
    return {
      currencies: WORKSPACE_CURRENCIES.map((code) => ({
        label: `${code} · ${currencyNames.of(code) ?? code}`,
        value: code,
      })),
      languages: LOCALES.map((code) => ({
        label: LANGUAGE_NAMES[code],
        value: code,
      })),
      timezones: timezones.map((zone) => ({
        label: zone.replaceAll("_", " "),
        value: zone,
      })),
    };
  }, [locale, timezone]);
}

function WorkspaceForm({
  locale,
  messages,
  workspace,
}: {
  locale: Locale;
  messages: WorkspaceMessages;
  workspace: Workspace;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const options = useWorkspaceOptions(locale, workspace.timezone);
  const { mutateAsync } = useMutation(
    orpc.workspace.update.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
      },
    })
  );

  const form = useSettingsForm({
    defaultValues: toFormValues(workspace, locale),
    onSubmit: async ({ value }) => {
      setSaveError(false);
      try {
        const saved = await mutateAsync(
          workspaceSettingsSchema.parse({
            ...value,
            defaultVatRate: parseVatRate(value.defaultVatRate),
            name: value.name.trim(),
          })
        );
        form.reset(toFormValues(saved, locale));
        toast.success(messages.saved);
      } catch {
        setSaveError(true);
      }
    },
    validators: { onSubmit: createFormSchema(messages) },
  });

  const handleSubmit = useSubmitHandler(form);

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      {saveError ? <SettingsAlert title={messages.saveError} /> : null}
      <form.AppForm>
        <SettingsCard
          description={messages.description}
          footer={<form.FormFooter messages={messages} />}
          title={messages.title}
        >
          <FieldGroup className="gap-0">
            <form.AppField name="name">
              {(field) => (
                <field.TextSettingField
                  description={messages.nameDescription}
                  title={messages.name}
                />
              )}
            </form.AppField>
            <form.AppField name="currency">
              {(field) => (
                <field.SelectSettingField
                  description={messages.currencyDescription}
                  options={options.currencies}
                  title={messages.currency}
                />
              )}
            </form.AppField>
            <form.AppField name="defaultVatRate">
              {(field) => (
                <field.TextSettingField
                  description={messages.vatRateDescription}
                  inputMode="decimal"
                  suffix="%"
                  title={messages.vatRate}
                />
              )}
            </form.AppField>
            <form.AppField name="locale">
              {(field) => (
                <field.SelectSettingField
                  description={messages.languageDescription}
                  options={options.languages}
                  title={messages.language}
                />
              )}
            </form.AppField>
            <form.AppField name="timezone">
              {(field) => (
                <field.SelectSettingField
                  description={messages.timezoneDescription}
                  last
                  options={options.timezones}
                  title={messages.timezone}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </SettingsCard>
      </form.AppForm>
    </form>
  );
}

export function WorkspaceSettings({
  locale,
  messages,
}: {
  locale: Locale;
  messages: WorkspaceMessages;
}) {
  const { data, isError, refetch } = useQuery(
    orpc.workspace.get.queryOptions()
  );
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (data) {
    return (
      <div className="flex flex-col gap-6">
        <WorkspaceForm locale={locale} messages={messages} workspace={data} />
        <BrandingSettings messages={messages} workspace={data} />
      </div>
    );
  }

  if (isError) {
    return <SettingsLoadError messages={messages} onRetry={handleRetry} />;
  }

  return <SettingsSkeleton rows={SETTING_ROWS.workspace} />;
}
