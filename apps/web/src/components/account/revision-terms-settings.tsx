"use client";

import {
  EXTRA_ROUND_DELAY_MAX_DAYS,
  EXTRA_ROUND_PRICE_MAX_CENTS,
  INCLUDED_ROUNDS_MAX,
  revisionTermsSchema,
} from "@roundcut/api/workspace";
import type { Locale } from "@roundcut/auth/locale";
import type { RevisionTerms } from "@roundcut/db/revision-terms";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { SettingsCard } from "./settings-card";
import {
  SettingsAlert,
  SettingsLoadError,
  useSettingsForm,
  useSubmitHandler,
} from "./settings-form";
import { SETTING_ROWS, SettingsSkeleton } from "./settings-skeleton";

type TermsMessages = Messages["account"]["terms"];

interface FormValues {
  extraRoundDelayDays: string;
  extraRoundPrice: string;
  includedRounds: string;
  requirePayment: boolean;
  scope: string;
}

const CENTS_PER_UNIT = 100;
const PRICE_PATTERN = /^\d{1,6}(?:[.,]\d{1,2})?$/;
const DAYS_PATTERN = /^\d{1,2}$/;
export const PRICE_MAX = EXTRA_ROUND_PRICE_MAX_CENTS / CENTS_PER_UNIT;

export const parsePrice = (value: string) =>
  Number(value.trim().replace(",", "."));

export const toPriceCents = (value: string) =>
  Math.round(parsePrice(value) * CENTS_PER_UNIT);

export const isPrice = (value: string) =>
  PRICE_PATTERN.test(value.trim()) && parsePrice(value) <= PRICE_MAX;

const isDelay = (value: string) =>
  DAYS_PATTERN.test(value.trim()) &&
  Number(value) <= EXTRA_ROUND_DELAY_MAX_DAYS;

const createFormSchema = (messages: TermsMessages, locale: Locale) =>
  z.object({
    extraRoundDelayDays: z.string().refine(
      isDelay,
      formatMessage(messages.delayInvalid, {
        max: EXTRA_ROUND_DELAY_MAX_DAYS,
      })
    ),
    extraRoundPrice: z.string().refine(
      isPrice,
      formatMessage(messages.priceInvalid, {
        max: new Intl.NumberFormat(locale).format(PRICE_MAX),
      })
    ),
    includedRounds: z.string(),
    requirePayment: z.boolean(),
    scope: z.string(),
  });

export const formatPrice = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: cents % CENTS_PER_UNIT ? 2 : 0,
    useGrouping: false,
  }).format(cents / CENTS_PER_UNIT);

const toFormValues = (terms: RevisionTerms, locale: Locale): FormValues => ({
  extraRoundDelayDays: String(terms.extraRoundDelayDays),
  extraRoundPrice: formatPrice(terms.extraRoundPriceCents, locale),
  includedRounds: String(terms.includedRounds),
  requirePayment: terms.requirePayment,
  scope: terms.scope,
});

const toRevisionTerms = (value: FormValues) =>
  revisionTermsSchema.parse({
    extraRoundDelayDays: Number(value.extraRoundDelayDays.trim()),
    extraRoundPriceCents: toPriceCents(value.extraRoundPrice),
    includedRounds: Number(value.includedRounds),
    requirePayment: value.requirePayment,
    scope: value.scope,
  });

function useTermsOptions(messages: TermsMessages) {
  return useMemo(
    () => ({
      includedRounds: Array.from(
        { length: INCLUDED_ROUNDS_MAX + 1 },
        (_, rounds) => ({ label: String(rounds), value: String(rounds) })
      ),
      scopes: [
        { label: messages.scopeDeliverable, value: "deliverable" },
        { label: messages.scopeProject, value: "project" },
      ],
    }),
    [messages]
  );
}

function RevisionTermsForm({
  currency,
  locale,
  messages,
  terms,
}: {
  currency: string;
  locale: Locale;
  messages: TermsMessages;
  terms: RevisionTerms;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const options = useTermsOptions(messages);
  const { mutateAsync } = useMutation(
    orpc.workspace.updateTerms.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
      },
    })
  );

  const form = useSettingsForm({
    defaultValues: toFormValues(terms, locale),
    onSubmit: async ({ value }) => {
      setSaveError(false);
      try {
        const saved = await mutateAsync(toRevisionTerms(value));
        form.reset(toFormValues(saved.revisionTerms, locale));
        toast.success(messages.saved);
      } catch {
        setSaveError(true);
      }
    },
    validators: { onSubmit: createFormSchema(messages, locale) },
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
            <form.AppField name="includedRounds">
              {(field) => (
                <field.SelectSettingField
                  description={messages.includedRoundsDescription}
                  options={options.includedRounds}
                  title={messages.includedRounds}
                />
              )}
            </form.AppField>
            <form.AppField name="extraRoundPrice">
              {(field) => (
                <field.TextSettingField
                  description={messages.priceDescription}
                  inputMode="decimal"
                  suffix={formatMessage(messages.priceSuffix, { currency })}
                  title={messages.price}
                />
              )}
            </form.AppField>
            <form.AppField name="extraRoundDelayDays">
              {(field) => (
                <field.TextSettingField
                  description={messages.delayDescription}
                  inputMode="numeric"
                  suffix={messages.delaySuffix}
                  title={messages.delay}
                />
              )}
            </form.AppField>
            <form.AppField name="requirePayment">
              {(field) => (
                <field.SwitchSettingField
                  description={messages.requirePaymentDescription}
                  title={messages.requirePayment}
                />
              )}
            </form.AppField>
            <form.AppField name="scope">
              {(field) => (
                <field.SelectSettingField
                  description={messages.scopeDescription}
                  last
                  options={options.scopes}
                  title={messages.scope}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </SettingsCard>
      </form.AppForm>
    </form>
  );
}

export function RevisionTermsSettings({
  locale,
  messages,
}: {
  locale: Locale;
  messages: TermsMessages;
}) {
  const { data, isError, refetch } = useQuery(
    orpc.workspace.get.queryOptions()
  );
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (data) {
    return (
      <RevisionTermsForm
        currency={data.currency}
        locale={locale}
        messages={messages}
        terms={data.revisionTerms}
      />
    );
  }

  if (isError) {
    return <SettingsLoadError messages={messages} onRetry={handleRetry} />;
  }

  return <SettingsSkeleton rows={SETTING_ROWS.terms} />;
}
