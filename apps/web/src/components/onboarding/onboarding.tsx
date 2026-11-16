"use client";

import {
  EXTRA_ROUND_DELAY_MAX_DAYS,
  INCLUDED_ROUNDS_MAX,
  isTimeZone,
  onboardingSchema,
  WORKSPACE_NAME_MAX_LENGTH,
} from "@roundcut/api/workspace";
import type { Locale } from "@roundcut/auth/locale";
import type { RevisionTerms } from "@roundcut/db/revision-terms";
import { Button } from "@roundcut/ui/components/button";
import { FieldGroup } from "@roundcut/ui/components/field";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@roundcut/ui/components/progress";
import { Frame, FramePanel } from "@roundcut/ui/components/reui/frame";
import { IconStack } from "@roundcut/ui/components/reui/icon-stack";
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@roundcut/ui/components/reui/stepper";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { Spinner } from "@roundcut/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useState } from "react";

import {
  formatPrice,
  isPrice,
  PRICE_MAX,
  toPriceCents,
} from "@/components/account/revision-terms-settings";
import {
  SettingsAlert,
  SettingsLoadError,
} from "@/components/account/settings-form";
import {
  formatVatRate,
  isVatRate,
  parseVatRate,
  useWorkspaceOptions,
} from "@/components/account/workspace-settings";
import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import {
  type ChangeValue,
  type OnboardingErrors,
  OnboardingNumberField,
  OnboardingSelectField,
  OnboardingTextField,
  type OnboardingValues,
} from "./onboarding-fields";

export interface OnboardingMessages {
  onboarding: Messages["onboarding"];
  terms: Messages["account"]["terms"];
  workspace: Messages["account"]["workspace"];
}

interface Workspace {
  currency: string;
  defaultVatRate: number;
  name: string;
  revisionTerms: RevisionTerms;
  timezone: string;
}

const STEPS = ["activity", "billing", "terms", "language"] as const;
type StepId = (typeof STEPS)[number];

const PERCENT = 100;

const browserTimeZone = () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isTimeZone(zone) ? zone : undefined;
};

const toInitialValues = (
  workspace: Workspace,
  locale: Locale
): OnboardingValues => ({
  currency: workspace.currency,
  defaultVatRate: formatVatRate(workspace.defaultVatRate, locale),
  extraRoundDelayDays: workspace.revisionTerms.extraRoundDelayDays,
  extraRoundPrice: formatPrice(
    workspace.revisionTerms.extraRoundPriceCents,
    locale
  ),
  includedRounds: workspace.revisionTerms.includedRounds,
  locale,
  name: workspace.name,
  timezone: browserTimeZone() ?? workspace.timezone,
});

function validateStep(
  step: StepId,
  values: OnboardingValues,
  messages: OnboardingMessages,
  locale: Locale
): OnboardingErrors {
  const errors: OnboardingErrors = {};
  if (step === "activity") {
    const name = values.name.trim();
    if (!name) {
      errors.name = messages.workspace.nameRequired;
    } else if (name.length > WORKSPACE_NAME_MAX_LENGTH) {
      errors.name = formatMessage(messages.workspace.nameTooLong, {
        max: WORKSPACE_NAME_MAX_LENGTH,
      });
    }
  }
  if (step === "billing" && !isVatRate(values.defaultVatRate)) {
    errors.defaultVatRate = messages.workspace.vatRateInvalid;
  }
  if (step === "terms") {
    if (values.includedRounds === null) {
      errors.includedRounds = formatMessage(
        messages.onboarding.includedRoundsInvalid,
        { max: INCLUDED_ROUNDS_MAX }
      );
    }
    if (!isPrice(values.extraRoundPrice)) {
      errors.extraRoundPrice = formatMessage(messages.terms.priceInvalid, {
        max: new Intl.NumberFormat(locale).format(PRICE_MAX),
      });
    }
    if (values.extraRoundDelayDays === null) {
      errors.extraRoundDelayDays = formatMessage(messages.terms.delayInvalid, {
        max: EXTRA_ROUND_DELAY_MAX_DAYS,
      });
    }
  }
  return errors;
}

const toOnboardingInput = (values: OnboardingValues, terms: RevisionTerms) =>
  onboardingSchema.parse({
    currency: values.currency,
    defaultVatRate: parseVatRate(values.defaultVatRate),
    locale: values.locale,
    name: values.name.trim(),
    revisionTerms: {
      ...terms,
      extraRoundDelayDays: values.extraRoundDelayDays,
      extraRoundPriceCents: toPriceCents(values.extraRoundPrice),
      includedRounds: values.includedRounds,
    },
    timezone: values.timezone,
  });

function OnboardingStepper({
  complete,
  current,
  messages,
  onStepChange,
}: {
  complete: boolean;
  current: number;
  messages: Messages["onboarding"];
  onStepChange: (step: number) => void;
}) {
  return (
    <Stepper
      indicators={{
        completed: <CheckIcon aria-hidden="true" className="size-3" />,
      }}
      onValueChange={onStepChange}
      orientation="vertical"
      value={current}
    >
      <StepperNav aria-label={messages.progressLabel} className="w-full">
        {STEPS.map((id, index) => {
          const step = index + 1;
          return (
            <StepperItem
              className="relative not-last:flex-1 items-start"
              completed={complete || step < current}
              disabled={complete || step > current}
              key={id}
              step={step}
            >
              <StepperTrigger className="w-full items-start gap-2.5 pb-6 text-left">
                <StepperIndicator className="size-5 text-xs">
                  {step}
                </StepperIndicator>
                <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-0.5">
                  <StepperTitle>{messages.steps[id].label}</StepperTitle>
                  <StepperDescription className="text-xs">
                    {messages.steps[id].summary}
                  </StepperDescription>
                </div>
              </StepperTrigger>
              {step < STEPS.length ? (
                <StepperSeparator className="absolute top-6 left-2.5 m-0 h-[calc(100%-1.75rem)]! -translate-x-1/2 group-data-[state=completed]/step:bg-primary" />
              ) : null}
            </StepperItem>
          );
        })}
      </StepperNav>
    </Stepper>
  );
}

function OnboardingSuccess({
  messages,
  name,
}: {
  messages: Messages["onboarding"]["success"];
  name: string;
}) {
  return (
    <div className="fade-in zoom-in-95 mx-auto flex w-full max-w-sm flex-1 animate-in flex-col justify-center gap-6 text-center duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]">
      <div aria-hidden="true" className="flex justify-center">
        <IconStack className="h-24 w-22 text-primary">
          <CircleCheckIcon className="size-5 text-primary" />
        </IconStack>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">
          {formatMessage(messages.title, { name })}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {messages.description}
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        {messages.cta}
      </Button>
    </div>
  );
}

function StepFields({
  currency,
  errors,
  locale,
  messages,
  onChange,
  step,
  values,
}: {
  currency: string;
  errors: OnboardingErrors;
  locale: Locale;
  messages: OnboardingMessages;
  onChange: ChangeValue;
  step: StepId;
  values: OnboardingValues;
}) {
  const options = useWorkspaceOptions(locale, values.timezone);
  const { terms, workspace } = messages;

  if (step === "activity") {
    return (
      <OnboardingTextField
        autoFocus
        description={workspace.nameDescription}
        error={errors.name}
        label={workspace.name}
        name="name"
        onChange={onChange}
        value={values.name}
      />
    );
  }
  if (step === "billing") {
    return (
      <>
        <OnboardingSelectField
          description={workspace.currencyDescription}
          label={workspace.currency}
          name="currency"
          onChange={onChange}
          options={options.currencies}
          value={values.currency}
        />
        <OnboardingTextField
          description={workspace.vatRateDescription}
          error={errors.defaultVatRate}
          inputMode="decimal"
          label={workspace.vatRate}
          name="defaultVatRate"
          onChange={onChange}
          suffix="%"
          value={values.defaultVatRate}
        />
      </>
    );
  }
  if (step === "terms") {
    return (
      <>
        <OnboardingNumberField
          description={terms.includedRoundsDescription}
          error={errors.includedRounds}
          label={terms.includedRounds}
          max={INCLUDED_ROUNDS_MAX}
          name="includedRounds"
          onChange={onChange}
          value={values.includedRounds}
        />
        <OnboardingTextField
          description={terms.priceDescription}
          error={errors.extraRoundPrice}
          inputMode="decimal"
          label={terms.price}
          name="extraRoundPrice"
          onChange={onChange}
          suffix={formatMessage(terms.priceSuffix, { currency })}
          value={values.extraRoundPrice}
        />
        <OnboardingNumberField
          description={terms.delayDescription}
          error={errors.extraRoundDelayDays}
          label={terms.delay}
          max={EXTRA_ROUND_DELAY_MAX_DAYS}
          name="extraRoundDelayDays"
          onChange={onChange}
          suffix={terms.delaySuffix}
          value={values.extraRoundDelayDays}
        />
      </>
    );
  }
  return (
    <>
      <OnboardingSelectField
        description={workspace.languageDescription}
        label={workspace.language}
        name="locale"
        onChange={onChange}
        options={options.languages}
        value={values.locale}
      />
      <OnboardingSelectField
        description={workspace.timezoneDescription}
        label={workspace.timezone}
        name="timezone"
        onChange={onChange}
        options={options.timezones}
        value={values.timezone}
      />
    </>
  );
}

function OnboardingWizard({
  locale,
  messages,
  workspace,
}: {
  locale: Locale;
  messages: OnboardingMessages;
  workspace: Workspace;
}) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(1);
  const [values, setValues] = useState(() =>
    toInitialValues(workspace, locale)
  );
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [complete, setComplete] = useState(false);
  const { isError, isPending, mutate } = useMutation(
    orpc.workspace.completeOnboarding.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
        setComplete(true);
      },
    })
  );

  const copy = messages.onboarding;
  const step = STEPS[current - 1] ?? "activity";
  const isLastStep = current === STEPS.length;
  const progress = complete ? PERCENT : (current / STEPS.length) * PERCENT;

  const handleChange = useCallback<ChangeValue>((name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
  }, []);

  const goToStep = useCallback((next: number) => {
    setErrors({});
    setCurrent(next);
  }, []);

  const handleBack = useCallback(
    () => goToStep(current - 1),
    [current, goToStep]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const stepErrors = validateStep(step, values, messages, locale);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        return;
      }
      if (isLastStep) {
        mutate(toOnboardingInput(values, workspace.revisionTerms));
        return;
      }
      goToStep(current + 1);
    },
    [
      current,
      goToStep,
      isLastStep,
      locale,
      messages,
      mutate,
      step,
      values,
      workspace.revisionTerms,
    ]
  );

  return (
    <main className="flex min-h-full w-full min-w-0 flex-col bg-muted/20 lg:flex-row">
      <aside className="hidden shrink-0 flex-col justify-center border-r px-7 py-10 lg:flex lg:w-72">
        <OnboardingStepper
          complete={complete}
          current={current}
          messages={copy}
          onStepChange={goToStep}
        />
      </aside>
      <section className="flex min-w-0 flex-1 p-3 sm:p-6">
        <Frame
          className="w-full flex-1 bg-muted/60 dark:bg-muted/10"
          spacing="xs"
          variant="ghost"
        >
          <FramePanel className="flex flex-1 flex-col px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
            {complete ? (
              <OnboardingSuccess
                messages={copy.success}
                name={values.name.trim()}
              />
            ) : (
              <form
                className="fade-in slide-in-from-right-2 mx-auto flex w-full max-w-md flex-1 animate-in flex-col gap-8 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                key={step}
                noValidate
                onSubmit={handleSubmit}
              >
                <Progress value={progress}>
                  <ProgressLabel className="text-muted-foreground">
                    {formatMessage(copy.progress, {
                      step: current,
                      total: STEPS.length,
                    })}
                  </ProgressLabel>
                  <ProgressValue />
                </Progress>
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-balance font-semibold text-xl">
                    {copy.steps[step].title}
                  </h1>
                  <p className="text-pretty text-muted-foreground text-sm">
                    {copy.steps[step].description}
                  </p>
                </div>
                {isError ? <SettingsAlert title={copy.saveError} /> : null}
                <FieldGroup className="gap-5">
                  <StepFields
                    currency={values.currency}
                    errors={errors}
                    locale={locale}
                    messages={messages}
                    onChange={handleChange}
                    step={step}
                    values={values}
                  />
                </FieldGroup>
                <div className="mt-auto flex flex-col gap-2">
                  <Button disabled={isPending} type="submit">
                    {isPending ? <Spinner aria-hidden="true" /> : null}
                    {isLastStep && isPending ? copy.finishing : null}
                    {isLastStep && !isPending ? copy.finish : null}
                    {isLastStep ? null : copy.continue}
                  </Button>
                  {current > 1 ? (
                    <Button
                      disabled={isPending}
                      onClick={handleBack}
                      type="button"
                      variant="outline"
                    >
                      {copy.back}
                    </Button>
                  ) : null}
                  <Button
                    nativeButton={false}
                    render={<Link href="/dashboard" />}
                    variant="ghost"
                  >
                    {copy.skip}
                  </Button>
                </div>
              </form>
            )}
          </FramePanel>
        </Frame>
      </section>
    </main>
  );
}

function OnboardingSkeleton() {
  return (
    <div aria-busy="true" className="flex w-full max-w-md flex-col gap-8">
      <Skeleton className="h-1 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function Onboarding({
  locale,
  messages,
}: {
  locale: Locale;
  messages: OnboardingMessages;
}) {
  const { data, isError, refetch } = useQuery(
    orpc.workspace.get.queryOptions()
  );
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (data) {
    return (
      <OnboardingWizard locale={locale} messages={messages} workspace={data} />
    );
  }

  return (
    <main className="flex w-full min-w-0 justify-center px-4 py-10">
      {isError ? (
        <div className="w-full max-w-md">
          <SettingsLoadError
            messages={messages.onboarding}
            onRetry={handleRetry}
          />
        </div>
      ) : (
        <OnboardingSkeleton />
      )}
    </main>
  );
}
