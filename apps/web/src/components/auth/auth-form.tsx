"use client";

import { Button } from "@roundcut/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@roundcut/ui/components/field";
import { Input } from "@roundcut/ui/components/input";
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
  ...props
}: { label: string; description?: string } & Omit<
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
      <Input aria-invalid={invalid} {...props} {...inputProps} />
    </FieldShell>
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
  fieldComponents: { PasswordField, TextareaField, TextField },
  fieldContext,
  formComponents: { SubmitButton },
  formContext,
});
