"use client";

import {
  isTimeZone,
  WORKSPACE_CURRENCIES,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceSettingsSchema,
} from "@roundcut/api/workspace";
import { LOCALES, type Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { FieldGroup } from "@roundcut/ui/components/field";
import { Input } from "@roundcut/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@roundcut/ui/components/input-group";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import {
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";

import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";

import { SettingRow } from "./setting-row";
import { SettingsCard } from "./settings-card";
import { WorkspaceSettingsSkeleton } from "./workspace-settings-skeleton";

type WorkspaceMessages = Messages["account"]["workspace"];
interface Option {
  label: string;
  value: string;
}

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

const parseVatRate = (value: string) => Number(value.trim().replace(",", "."));

const isVatRate = (value: string) =>
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

const toFormValues = (workspace: Workspace, locale: Locale): FormValues => ({
  currency: workspace.currency,
  defaultVatRate: new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(workspace.defaultVatRate),
  locale: workspace.locale,
  name: workspace.name,
  timezone: workspace.timezone,
});

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

function TextSettingField({
  description,
  inputMode,
  last,
  suffix,
  title,
}: {
  description: string;
  inputMode?: "decimal";
  last?: boolean;
  suffix?: string;
  title: string;
}) {
  const field = useFieldContext<string>();
  const { errors } = field.state.meta;
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const inputProps = {
    "aria-invalid": errors.length > 0,
    id: field.name,
    inputMode,
    name: field.name,
    onBlur: field.handleBlur,
    onChange: handleChange,
    value: field.state.value,
  };

  return (
    <SettingRow
      description={description}
      errors={errors}
      labelFor={field.name}
      last={last}
      title={title}
    >
      {suffix ? (
        <InputGroup className="w-full">
          <InputGroupInput {...inputProps} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...inputProps} />
      )}
    </SettingRow>
  );
}

function SelectSettingField({
  description,
  last,
  options,
  title,
}: {
  description: string;
  last?: boolean;
  options: Option[];
  title: string;
}) {
  const field = useFieldContext<string>();
  const { errors } = field.state.meta;
  const { value } = field.state;
  const handleValueChange = useCallback(
    (next: string | null) => {
      if (next !== null) {
        field.handleChange(next);
      }
    },
    [field]
  );
  const selected = options.find((option) => option.value === value);

  return (
    <SettingRow
      description={description}
      errors={errors}
      labelFor={field.name}
      last={last}
      title={title}
    >
      <Select onValueChange={handleValueChange} value={value}>
        <SelectTrigger
          aria-invalid={errors.length > 0}
          className="w-full"
          id={field.name}
        >
          <SelectValue>{selected?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </SettingRow>
  );
}

const selectFooterState = (state: {
  isDirty: boolean;
  isSubmitting: boolean;
}) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting });

function FormFooter({ messages }: { messages: WorkspaceMessages }) {
  const form = useFormContext();
  const { isDirty, isSubmitting } = useStore(form.store, selectFooterState);
  const handleReset = useCallback(() => form.reset(), [form]);

  return (
    <>
      <Button
        disabled={!isDirty || isSubmitting}
        onClick={handleReset}
        type="button"
        variant="outline"
      >
        {messages.cancel}
      </Button>
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? messages.saving : messages.save}
      </Button>
    </>
  );
}

const { useAppForm } = createFormHook({
  fieldComponents: { SelectSettingField, TextSettingField },
  fieldContext,
  formComponents: { FormFooter },
  formContext,
});

function useWorkspaceOptions(locale: Locale, timezone: string) {
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

  const form = useAppForm({
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

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      {saveError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{messages.saveError}</AlertTitle>
        </Alert>
      ) : null}
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
      <WorkspaceForm locale={locale} messages={messages} workspace={data} />
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>{messages.loadErrorTitle}</AlertTitle>
        <AlertDescription>{messages.loadErrorDescription}</AlertDescription>
        <AlertAction>
          <Button
            onClick={handleRetry}
            size="xs"
            type="button"
            variant="outline"
          >
            {messages.retry}
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  return <WorkspaceSettingsSkeleton />;
}
