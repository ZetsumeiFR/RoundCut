"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@roundcut/ui/components/field";
import { Input } from "@roundcut/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@roundcut/ui/components/input-group";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@roundcut/ui/components/reui/number-field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { type ChangeEvent, type ReactNode, useCallback } from "react";

import type { SettingOption } from "@/components/account/settings-form";

export interface OnboardingValues {
  currency: string;
  defaultVatRate: string;
  extraRoundDelayDays: number | null;
  extraRoundPrice: string;
  includedRounds: number | null;
  locale: string;
  name: string;
  timezone: string;
}

type TextFieldName = {
  [K in keyof OnboardingValues]: OnboardingValues[K] extends string ? K : never;
}[keyof OnboardingValues];

type NumberFieldName = {
  [K in keyof OnboardingValues]: OnboardingValues[K] extends number | null
    ? K
    : never;
}[keyof OnboardingValues];

export type OnboardingErrors = Partial<Record<keyof OnboardingValues, string>>;

export type ChangeValue = <K extends keyof OnboardingValues>(
  name: K,
  value: OnboardingValues[K]
) => void;

const fieldId = (name: keyof OnboardingValues) => `onboarding-${name}`;

function OnboardingField({
  children,
  description,
  error,
  label,
  name,
}: {
  children: ReactNode;
  description?: string;
  error?: string;
  label: string;
  name: keyof OnboardingValues;
}) {
  return (
    <Field className="gap-2" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={fieldId(name)}>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function OnboardingTextField({
  autoFocus,
  description,
  error,
  inputMode,
  label,
  name,
  onChange,
  suffix,
  value,
}: {
  autoFocus?: boolean;
  description?: string;
  error?: string;
  inputMode?: "decimal";
  label: string;
  name: TextFieldName;
  onChange: ChangeValue;
  suffix?: string;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange(name, event.target.value),
    [name, onChange]
  );
  const inputProps = {
    "aria-invalid": Boolean(error),
    autoFocus,
    id: fieldId(name),
    inputMode,
    name,
    onChange: handleChange,
    value,
  };

  return (
    <OnboardingField
      description={description}
      error={error}
      label={label}
      name={name}
    >
      {suffix ? (
        <InputGroup>
          <InputGroupInput {...inputProps} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...inputProps} />
      )}
    </OnboardingField>
  );
}

export function OnboardingSelectField({
  description,
  label,
  name,
  onChange,
  options,
  value,
}: {
  description?: string;
  label: string;
  name: TextFieldName;
  onChange: ChangeValue;
  options: SettingOption[];
  value: string;
}) {
  const handleValueChange = useCallback(
    (next: string | null) => {
      if (next !== null) {
        onChange(name, next);
      }
    },
    [name, onChange]
  );
  const selected = options.find((option) => option.value === value);

  return (
    <OnboardingField description={description} label={label} name={name}>
      <Select onValueChange={handleValueChange} value={value}>
        <SelectTrigger className="w-full" id={fieldId(name)}>
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
    </OnboardingField>
  );
}

export function OnboardingNumberField({
  description,
  error,
  label,
  max,
  name,
  onChange,
  suffix,
  value,
}: {
  description?: string;
  error?: string;
  label: string;
  max: number;
  name: NumberFieldName;
  onChange: ChangeValue;
  suffix?: string;
  value: number | null;
}) {
  const handleValueChange = useCallback(
    (next: number | null) => onChange(name, next),
    [name, onChange]
  );

  return (
    <OnboardingField
      description={description}
      error={error}
      label={label}
      name={name}
    >
      <NumberField
        id={fieldId(name)}
        max={max}
        min={0}
        name={name}
        onValueChange={handleValueChange}
        step={1}
        value={value}
      >
        <div className="flex w-full items-center gap-2">
          <NumberFieldGroup aria-invalid={Boolean(error)} className="w-40">
            <NumberFieldDecrement />
            <NumberFieldInput aria-invalid={Boolean(error)} />
            <NumberFieldIncrement />
          </NumberFieldGroup>
          {suffix ? (
            <span className="text-muted-foreground text-sm">{suffix}</span>
          ) : null}
        </div>
      </NumberField>
    </OnboardingField>
  );
}
