"use client";

import { Button } from "@roundcut/ui/components/button";
import {
  Field,
  FieldContent,
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { Switch } from "@roundcut/ui/components/switch";
import { Textarea } from "@roundcut/ui/components/textarea";
import {
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import {
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
  useCallback,
} from "react";

import { PasswordInput } from "./password-input";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

type ControlledInputProps = "id" | "name" | "value" | "onBlur" | "onChange";

function useInputField() {
  const field = useFieldContext<string>();
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  return {
    field,
    inputProps: {
      id: field.name,
      name: field.name,
      onBlur: field.handleBlur,
      onChange: handleChange,
      value: field.state.value,
    },
    invalid: field.state.meta.errors.length > 0,
  };
}

function FieldShell({
  label,
  description,
  htmlFor,
  invalid,
  errors,
  children,
}: {
  label: string;
  description?: string;
  htmlFor: string;
  invalid: boolean;
  errors: Array<{ message?: string } | undefined>;
  children: ReactNode;
}) {
  return (
    <Field className="gap-2" data-invalid={invalid}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={errors} />
    </Field>
  );
}

function TextField({
  label,
  description,
  suffix,
  ...props
}: { label: string; description?: string; suffix?: string } & Omit<
  ComponentProps<typeof Input>,
  ControlledInputProps
>) {
  const { field, invalid, inputProps } = useInputField();
  return (
    <FieldShell
      description={description}
      errors={field.state.meta.errors}
      htmlFor={field.name}
      invalid={invalid}
      label={label}
    >
      {suffix ? (
        <InputGroup>
          <InputGroupInput aria-invalid={invalid} {...props} {...inputProps} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input aria-invalid={invalid} {...props} {...inputProps} />
      )}
    </FieldShell>
  );
}

function SelectField({
  label,
  description,
  options,
}: {
  label: string;
  description?: string;
  options: Array<{ label: string; value: string }>;
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
    <FieldShell
      description={description}
      errors={errors}
      htmlFor={field.name}
      invalid={errors.length > 0}
      label={label}
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
    </FieldShell>
  );
}

function SwitchField({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  const field = useFieldContext<boolean>();
  const handleCheckedChange = useCallback(
    (checked: boolean) => field.handleChange(checked),
    [field]
  );
  return (
    <Field className="gap-3" orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
      {/* Base UI puts the id on a hidden input, so name the switch itself. */}
      <Switch
        aria-label={label}
        checked={field.state.value}
        id={field.name}
        name={field.name}
        onCheckedChange={handleCheckedChange}
      />
    </Field>
  );
}

function TextareaField({
  label,
  description,
  ...props
}: { label: string; description?: string } & Omit<
  ComponentProps<typeof Textarea>,
  ControlledInputProps
>) {
  const { field, invalid, inputProps } = useInputField();
  return (
    <FieldShell
      description={description}
      errors={field.state.meta.errors}
      htmlFor={field.name}
      invalid={invalid}
      label={label}
    >
      <Textarea aria-invalid={invalid} {...props} {...inputProps} />
    </FieldShell>
  );
}

function PasswordField({
  label,
  ...props
}: { label: string } & Omit<
  ComponentProps<typeof PasswordInput>,
  ControlledInputProps
>) {
  const { field, invalid, inputProps } = useInputField();
  return (
    <FieldShell
      errors={field.state.meta.errors}
      htmlFor={field.name}
      invalid={invalid}
      label={label}
    >
      <PasswordInput aria-invalid={invalid} {...props} {...inputProps} />
    </FieldShell>
  );
}

const selectIsSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const form = useFormContext();
  const isSubmitting = useStore(form.store, selectIsSubmitting);
  const text = isSubmitting ? pendingLabel : label;
  return (
    <Button className="w-full" disabled={isSubmitting} type="submit">
      {text}
    </Button>
  );
}

export const { useAppForm } = createFormHook({
  fieldComponents: {
    PasswordField,
    SelectField,
    SwitchField,
    TextareaField,
    TextField,
  },
  fieldContext,
  formComponents: { SubmitButton },
  formContext,
});
