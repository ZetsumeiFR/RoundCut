"use client";

import {
  type DeliverableInput,
  PROJECT_MAX_DELIVERABLES,
} from "@roundcut/api/deliverable";
import {
  PROJECT_FLAT_FEE_MAX_CENTS,
  PROJECT_NAME_MAX_LENGTH,
} from "@roundcut/api/project";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { Calendar } from "@roundcut/ui/components/calendar";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from "@roundcut/ui/components/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@roundcut/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { CalendarIcon, CalendarSearchIcon, XIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { enUS, fr } from "react-day-picker/locale";
import { toast } from "sonner";
import z from "zod";

import {
  addTermsIssues,
  parsePrice,
  type TermsFormValues,
  type TermsMessages,
  termsFormValuesSchema,
  toPriceCents,
  toRevisionTerms,
  toTermsFormValues,
  useTermsOptions,
} from "@/components/account/revision-terms-settings";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import type { Client, WorkspaceTerms } from "@/components/clients/client-sheet";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import {
  DeliverableForm,
  type DeliverableItem,
  DeliverableList,
} from "./deliverable-form";
import {
  isPresetPlanTemplate,
  type PlanTemplateId,
  PRESET_PLAN_TEMPLATES,
} from "./plan-templates";

type ProjectsMessages = Messages["projects"];
type FormMessages = ProjectsMessages["form"];

export type Project = Awaited<
  ReturnType<AppRouterClient["project"]["list"]>
>[number];

const CENTS_PER_UNIT = 100;
const FLAT_FEE_MAX = PROJECT_FLAT_FEE_MAX_CENTS / CENTS_PER_UNIT;
const FLAT_FEE_PATTERN = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const FRIDAY = 5;
const DAYS_PER_WEEK = 7;
const TWO_WEEKS_DAYS = 14;
const CALENDAR_LOCALES = { en: enUS, fr } as const;

const isFlatFee = (value: string) =>
  value.trim() === "" ||
  (FLAT_FEE_PATTERN.test(value.trim()) && parsePrice(value) <= FLAT_FEE_MAX);

// Target dates are calendar days, stored as YYYY-MM-DD and read in local time.
const toIsoDate = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const fromIsoDate = (value: string) => new Date(`${value}T00:00:00`);

export const formatTargetDate = (value: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    fromIsoDate(value)
  );

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// The next Friday, a week later when today is already Friday.
const endOfWeek = (today: Date) =>
  addDays(
    today,
    (FRIDAY - today.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK
  );

function endOfMonth(today: Date) {
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return monthEnd.getDate() === today.getDate()
    ? new Date(today.getFullYear(), today.getMonth() + 2, 0)
    : monthEnd;
}

interface DateOption {
  date: string;
  id: string;
  label: string;
}

const NO_DATE_ID = "none";
const CUSTOM_DATE_ID = "custom";

function projectFormSchema(
  errors: FormMessages["errors"],
  terms: TermsMessages,
  locale: Locale
) {
  return z
    .object({
      clientId: z.string().min(1, errors.clientRequired),
      customTerms: z.boolean(),
      // Each deliverable is validated by its own form when it's added.
      deliverables: z.array(z.custom<DeliverableItem>()),
      flatFee: z.string().refine(
        isFlatFee,
        formatMessage(errors.flatFeeInvalid, {
          max: new Intl.NumberFormat(locale).format(FLAT_FEE_MAX),
        })
      ),
      name: z
        .string()
        .trim()
        .min(1, errors.nameRequired)
        .max(
          PROJECT_NAME_MAX_LENGTH,
          formatMessage(errors.tooLong, { max: PROJECT_NAME_MAX_LENGTH })
        ),
      targetDate: z.string(),
      terms: termsFormValuesSchema,
    })
    .superRefine(({ customTerms, terms: values }, context) => {
      // Hidden plan terms fields are ignored when the project inherits them.
      if (customTerms) {
        addTermsIssues(values, terms, locale, context);
      }
    });
}

type ProjectFormValues = z.input<ReturnType<typeof projectFormSchema>> & {
  terms: TermsFormValues;
};

// What a new project inherits: the client's own terms, else the workspace
// defaults (CLI-03). The server takes the same snapshot when none is sent.
const inheritedTerms = (
  client: Client | undefined,
  workspace: WorkspaceTerms
) => client?.revisionTerms ?? workspace.revisionTerms;

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;
const selectCustomTerms = (state: { values: ProjectFormValues }) =>
  state.values.customTerms;
const selectClientId = (state: { values: ProjectFormValues }) =>
  state.values.clientId;
const selectDeliverables = (state: { values: ProjectFormValues }) =>
  state.values.deliverables;

const clientSearchText = (client: Client) =>
  `${client.name} ${client.deciderName}`;
const isSameClient = (item: Client, value: Client) => item.id === value.id;

function ClientField({
  clients,
  errors,
  messages,
  name,
  onBlur,
  onChange,
  value,
}: {
  clients: Client[];
  errors: Array<{ message?: string } | undefined>;
  messages: FormMessages;
  name: string;
  onBlur: () => void;
  onChange: (clientId: string) => void;
  value: string;
}) {
  const selected = clients.find((client) => client.id === value) ?? null;
  const invalid = errors.length > 0;
  const handleValueChange = useCallback(
    (next: Client | null) => {
      if (next) {
        onChange(next.id);
      }
    },
    [onChange]
  );

  return (
    <Field className="gap-2" data-invalid={invalid}>
      <FieldLabel htmlFor={name}>{messages.client}</FieldLabel>
      <Combobox
        autoHighlight
        isItemEqualToValue={isSameClient}
        items={clients}
        itemToStringValue={clientSearchText}
        modal={false}
        onValueChange={handleValueChange}
        value={selected}
      >
        <ComboboxTrigger
          render={
            <Button
              aria-invalid={invalid}
              className="w-full justify-between gap-2 font-normal"
              id={name}
              onBlur={onBlur}
              type="button"
              variant="outline"
            />
          }
        >
          <ComboboxValue>
            {(client: Client | null) =>
              client ? (
                <span className="truncate">{client.name}</span>
              ) : (
                <span className="truncate text-muted-foreground">
                  {messages.clientPlaceholder}
                </span>
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>
        <ComboboxContent className="pointer-events-auto min-w-64">
          <ComboboxInput
            className="mb-1"
            placeholder={messages.clientSearch}
            showTrigger={false}
          />
          <ComboboxEmpty>{messages.clientEmpty}</ComboboxEmpty>
          <ComboboxList>
            {(client: Client) => (
              <ComboboxItem key={client.id} value={client}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{client.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {client.deciderName}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError errors={errors} />
    </Field>
  );
}

function DateOptionRow({
  locale,
  option,
}: {
  locale: Locale;
  option: DateOption;
}) {
  const Icon = option.id === CUSTOM_DATE_ID ? CalendarSearchIcon : CalendarIcon;
  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="truncate">{option.label}</span>
      </span>
      {option.date ? (
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {formatTargetDate(option.date, locale)}
        </span>
      ) : null}
    </span>
  );
}

const optionSearchText = (option: DateOption) => option.label;
const isSameOption = (item: DateOption, value: DateOption) =>
  item.id === value.id;

// Presets and a calendar for any other day, like the @reui/sheet-1 target
// date picker.
function TargetDateField({
  cancelLabel,
  locale,
  messages,
  name,
  onChange,
  value,
}: {
  cancelLabel: string;
  locale: Locale;
  messages: FormMessages;
  name: string;
  onChange: (date: string) => void;
  value: string;
}) {
  const today = useMemo(startOfToday, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Date | undefined>(undefined);

  const noDate: DateOption = {
    date: "",
    id: NO_DATE_ID,
    label: messages.targetDateNone,
  };
  const custom: DateOption = {
    date: "",
    id: CUSTOM_DATE_ID,
    label: messages.targetDateCustom,
  };
  const candidates: DateOption[] = [
    {
      date: toIsoDate(endOfWeek(today)),
      id: "end-of-week",
      label: messages.targetDateEndOfWeek,
    },
    {
      date: toIsoDate(addDays(today, TWO_WEEKS_DAYS)),
      id: "in-two-weeks",
      label: messages.targetDateInTwoWeeks,
    },
    {
      date: toIsoDate(endOfMonth(today)),
      id: "end-of-month",
      label: messages.targetDateEndOfMonth,
    },
  ];
  // Near the end of a month two presets can land on the same day.
  const presets = candidates.filter(
    (option, index) =>
      candidates.findIndex((other) => other.date === option.date) === index
  );
  const options = [noDate, ...presets, custom];
  const selected = value
    ? (presets.find((option) => option.date === value) ?? null)
    : noDate;

  const handleOptionChange = useCallback(
    (option: DateOption | null) => {
      if (!option) {
        return;
      }
      if (option.id === CUSTOM_DATE_ID) {
        setDraft(value ? fromIsoDate(value) : addDays(today, 1));
        // Let the combobox popup close before the dialog takes focus.
        requestAnimationFrame(() => setPickerOpen(true));
        return;
      }
      onChange(option.date);
    },
    [onChange, today, value]
  );

  const confirmDraft = useCallback(() => {
    if (draft) {
      onChange(toIsoDate(draft));
      setPickerOpen(false);
    }
  }, [draft, onChange]);

  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={name}>{messages.targetDate}</FieldLabel>
      <Combobox
        isItemEqualToValue={isSameOption}
        items={options}
        itemToStringValue={optionSearchText}
        modal={false}
        onValueChange={handleOptionChange}
        value={selected}
      >
        <ComboboxTrigger
          render={
            <Button
              className="w-full justify-between gap-2 font-normal"
              id={name}
              type="button"
              variant="outline"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            {value ? (
              <span className="truncate">
                {formatTargetDate(value, locale)}
              </span>
            ) : (
              <span className="truncate text-muted-foreground">
                {messages.targetDateNone}
              </span>
            )}
          </span>
        </ComboboxTrigger>
        <ComboboxContent className="pointer-events-auto min-w-72">
          <ComboboxList>
            <ComboboxItem value={noDate}>
              <DateOptionRow locale={locale} option={noDate} />
            </ComboboxItem>
            <ComboboxSeparator />
            {presets.map((option) => (
              <ComboboxItem key={option.id} value={option}>
                <DateOptionRow locale={locale} option={option} />
              </ComboboxItem>
            ))}
            <ComboboxSeparator />
            <ComboboxItem value={custom}>
              <DateOptionRow locale={locale} option={custom} />
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Dialog onOpenChange={setPickerOpen} open={pickerOpen}>
        <DialogContent className="pointer-events-auto flex w-auto max-w-[calc(100vw-2rem)] flex-col gap-0 sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{messages.targetDateDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <Calendar
              defaultMonth={draft ?? today}
              disabled={{ before: today }}
              locale={CALENDAR_LOCALES[locale]}
              mode="single"
              onSelect={setDraft}
              selected={draft}
              showOutsideDays={false}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button size="sm" variant="outline" />}>
              {cancelLabel}
            </DialogClose>
            <Button
              disabled={!draft}
              onClick={confirmDraft}
              size="sm"
              type="button"
            >
              {messages.targetDatePick}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}

function ProjectForm({
  clients,
  locale,
  messages,
  onCancel,
  onCreated,
  template,
  terms,
  workspace,
}: {
  clients: Client[];
  locale: Locale;
  messages: ProjectsMessages;
  onCancel: () => void;
  onCreated: (project: Project) => void;
  template: PlanTemplateId | null;
  terms: TermsMessages;
  workspace: WorkspaceTerms;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const { form: formMessages } = messages;
  const termsOptions = useTermsOptions(terms);
  const schema = useMemo(
    () => projectFormSchema(formMessages.errors, terms, locale),
    [formMessages.errors, locale, terms]
  );

  const presetTemplate =
    template && isPresetPlanTemplate(template) ? template : null;
  const defaultValues: ProjectFormValues = {
    clientId: clients.length === 1 ? (clients[0]?.id ?? "") : "",
    customTerms: presetTemplate !== null,
    deliverables: [],
    flatFee: "",
    name: "",
    targetDate: "",
    terms: toTermsFormValues(
      presetTemplate
        ? PRESET_PLAN_TEMPLATES[presetTemplate]
        : workspace.revisionTerms,
      locale
    ),
  };

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({
      value: {
        clientId: ownerId,
        customTerms,
        deliverables,
        flatFee,
        name,
        targetDate,
        terms: values,
      },
    }) => {
      setSaveError(false);
      try {
        const created = await api.project.create({
          clientId: ownerId,
          deliverables: deliverables.map(({ id: _id, ...item }) => item),
          flatFeeCents: flatFee.trim() ? toPriceCents(flatFee) : null,
          name,
          revisionTerms: customTerms ? toRevisionTerms(values) : null,
          targetDate: targetDate || null,
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.project.list.queryKey(),
        });
        onCreated(created);
      } catch {
        setSaveError(true);
      }
    },
    validators: { onSubmit: schema },
  });

  const isSubmitting = useStore(form.store, selectIsSubmitting);
  const showTermsFields = useStore(form.store, selectCustomTerms);
  const clientId = useStore(form.store, selectClientId);
  const selectedClient = clients.find((client) => client.id === clientId);
  const addedDeliverables = useStore(form.store, selectDeliverables);
  const { deliverables: deliverableMessages } = messages;

  const handleAddDeliverable = useCallback(
    (values: DeliverableInput) => {
      form.pushFieldValue("deliverables", {
        ...values,
        id: crypto.randomUUID(),
      });
      return true;
    },
    [form]
  );
  const handleRemoveDeliverable = useCallback(
    (id: string) =>
      form.setFieldValue("deliverables", (items) =>
        items.filter((item) => item.id !== id)
      ),
    [form]
  );

  // Turning custom terms on starts from what the project would inherit.
  const handleCustomTermsChange = useCallback(
    ({ value }: { value: boolean }) => {
      if (!value) {
        return;
      }
      const owner = clients.find(
        (client) => client.id === form.getFieldValue("clientId")
      );
      form.setFieldValue(
        "terms",
        toTermsFormValues(inheritedTerms(owner, workspace), locale)
      );
    },
    [clients, form, locale, workspace]
  );
  const customTermsListeners = useMemo(
    () => ({ onChange: handleCustomTermsChange }),
    [handleCustomTermsChange]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  let inheritanceHint = selectedClient?.revisionTerms
    ? formatMessage(formMessages.customTermsClient, {
        client: selectedClient.name,
      })
    : formMessages.customTermsWorkspace;
  if (presetTemplate) {
    inheritanceHint = formatMessage(formMessages.templateApplied, {
      template: messages.templates[presetTemplate].name,
    });
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit}
    >
      <SheetHeader className="gap-1 border-b px-5 py-4 pr-12">
        <SheetTitle className="text-base">
          {formMessages.createTitle}
        </SheetTitle>
        <SheetDescription>{formMessages.createDescription}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        {saveError ? (
          <AuthErrorAlert
            message={messages.actionError}
            title={messages.actionError}
          />
        ) : null}
        <form.AppForm>
          <FieldGroup className="gap-4">
            <form.AppField name="clientId">
              {(field) => (
                <ClientField
                  clients={clients}
                  errors={field.state.meta.errors}
                  messages={formMessages}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.AppField>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  label={formMessages.name}
                  placeholder={formMessages.namePlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField name="targetDate">
              {(field) => (
                <TargetDateField
                  cancelLabel={messages.cancel}
                  locale={locale}
                  messages={formMessages}
                  name={field.name}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.AppField>
            <form.AppField name="flatFee">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  description={formMessages.flatFeeDescription}
                  inputMode="decimal"
                  label={formMessages.flatFee}
                  suffix={formatMessage(terms.priceSuffix, {
                    currency: workspace.currency,
                  })}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <FieldSet className="gap-3">
            <FieldLegend className="mb-0" variant="label">
              {deliverableMessages.legend}
            </FieldLegend>
            <FieldDescription>
              {deliverableMessages.createDescription}
            </FieldDescription>
            {addedDeliverables.length > 0 ? (
              <DeliverableList
                deliverables={addedDeliverables}
                messages={deliverableMessages}
                onRemove={handleRemoveDeliverable}
              />
            ) : null}
            <DeliverableForm
              limitMessage={
                addedDeliverables.length >= PROJECT_MAX_DELIVERABLES
                  ? formatMessage(deliverableMessages.errors.limit, {
                      max: PROJECT_MAX_DELIVERABLES,
                    })
                  : undefined
              }
              messages={deliverableMessages}
              onAdd={handleAddDeliverable}
            />
          </FieldSet>
          <FieldSet className="gap-4">
            <FieldLegend variant="label">{terms.title}</FieldLegend>
            <form.AppField listeners={customTermsListeners} name="customTerms">
              {(field) => (
                <field.SwitchField
                  description={inheritanceHint}
                  label={formMessages.customTerms}
                />
              )}
            </form.AppField>
            {showTermsFields ? (
              <>
                <form.AppField name="terms.includedRounds">
                  {(field) => (
                    <field.SelectField
                      description={terms.includedRoundsDescription}
                      label={terms.includedRounds}
                      options={termsOptions.includedRounds}
                    />
                  )}
                </form.AppField>
                <form.AppField name="terms.extraRoundPrice">
                  {(field) => (
                    <field.TextField
                      autoComplete="off"
                      description={terms.priceDescription}
                      inputMode="decimal"
                      label={terms.price}
                      suffix={formatMessage(terms.priceSuffix, {
                        currency: workspace.currency,
                      })}
                    />
                  )}
                </form.AppField>
                <form.AppField name="terms.extraRoundDelayDays">
                  {(field) => (
                    <field.TextField
                      autoComplete="off"
                      description={terms.delayDescription}
                      inputMode="numeric"
                      label={terms.delay}
                      suffix={terms.delaySuffix}
                    />
                  )}
                </form.AppField>
                <form.AppField name="terms.requirePayment">
                  {(field) => (
                    <field.SwitchField
                      description={terms.requirePaymentDescription}
                      label={terms.requirePayment}
                    />
                  )}
                </form.AppField>
                <form.AppField name="terms.scope">
                  {(field) => (
                    <field.SelectField
                      description={terms.scopeDescription}
                      label={terms.scope}
                      options={termsOptions.scopes}
                    />
                  )}
                </form.AppField>
              </>
            ) : null}
          </FieldSet>
        </form.AppForm>
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
        <Button onClick={onCancel} type="button" variant="outline">
          {messages.cancel}
        </Button>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? formMessages.creating : formMessages.create}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function ProjectSheet({
  clients,
  locale,
  messages,
  onOpenChange,
  open,
  template = null,
  terms,
  workspace,
}: {
  clients: Client[];
  locale: Locale;
  messages: ProjectsMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  template?: PlanTemplateId | null;
  terms: TermsMessages;
  workspace: WorkspaceTerms;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleCreated = useCallback(
    (project: Project) => {
      toast.success(formatMessage(messages.saved, { name: project.name }));
      close();
    },
    [close, messages.saved]
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full gap-0 sm:max-w-md"
        showCloseButton={false}
      >
        {open ? (
          <ProjectForm
            clients={clients}
            locale={locale}
            messages={messages}
            onCancel={close}
            onCreated={handleCreated}
            template={template}
            terms={terms}
            workspace={workspace}
          />
        ) : null}
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
          <span className="sr-only">{messages.close}</span>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
