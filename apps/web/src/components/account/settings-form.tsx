"use client";

import { Button } from "@roundcut/ui/components/button";
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
import { Switch } from "@roundcut/ui/components/switch";
import {
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import { CircleAlertIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback } from "react";

import { SettingRow } from "./setting-row";

export interface SettingOption {
  label: string;
  value: string;
}

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
  inputMode?: "decimal" | "numeric";
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
  options: SettingOption[];
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

function SwitchSettingField({
  description,
  last,
  title,
}: {
  description: string;
  last?: boolean;
  title: string;
}) {
  const field = useFieldContext<boolean>();
  const { errors } = field.state.meta;
  const handleCheckedChange = useCallback(
    (checked: boolean) => field.handleChange(checked),
    [field]
  );

  return (
    <SettingRow
      description={description}
      errors={errors}
      labelFor={field.name}
      last={last}
      title={title}
    >
      <Switch
        aria-label={title}
        checked={field.state.value}
        id={field.name}
        name={field.name}
        onCheckedChange={handleCheckedChange}
      />
    </SettingRow>
  );
}

const selectFooterState = (state: {
  isDirty: boolean;
  isSubmitting: boolean;
}) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting });

function FormFooter({
  messages,
}: {
  messages: { cancel: string; save: string; saving: string };
}) {
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

export const { useAppForm: useSettingsForm } = createFormHook({
  fieldComponents: { SelectSettingField, SwitchSettingField, TextSettingField },
  fieldContext,
  formComponents: { FormFooter },
  formContext,
});

export function useSubmitHandler(form: { handleSubmit: () => unknown }) {
  return useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );
}

export function SettingsAlert({ title }: { title: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
    </Alert>
  );
}

export function SettingsLoadError({
  messages,
  onRetry,
}: {
  messages: {
    loadErrorDescription: string;
    loadErrorTitle: string;
    retry: string;
  };
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{messages.loadErrorTitle}</AlertTitle>
      <AlertDescription>{messages.loadErrorDescription}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="xs" type="button" variant="outline">
          {messages.retry}
        </Button>
      </AlertAction>
    </Alert>
  );
}
