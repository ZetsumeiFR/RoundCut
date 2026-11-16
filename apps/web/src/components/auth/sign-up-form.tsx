"use client";

import { MIN_PASSWORD_LENGTH } from "@roundcut/auth/password-policy";
import { Button } from "@roundcut/ui/components/button";
import { FieldGroup } from "@roundcut/ui/components/field";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import z from "zod";

import { formatMessage, type Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { authErrorMessage } from "./auth-error";
import { AuthErrorAlert } from "./auth-error-alert";
import { useAppForm } from "./auth-form";

export function SignUpForm({
  messages,
  onSignedUp,
  onSwitchToSignIn,
  social,
}: {
  messages: Messages["auth"];
  onSignedUp: (email: string) => void;
  onSwitchToSignIn: () => void;
  social?: ReactNode;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { fields, validation, signUp } = messages;

  const form = useAppForm({
    defaultValues: { email: "", name: "", password: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const { error } = await authClient.signUp.email({
        callbackURL: `${window.location.origin}/onboarding`,
        email: value.email,
        name: value.name.trim(),
        password: value.password,
      });
      if (error) {
        setSubmitError(authErrorMessage(error.code, messages.errors));
        return;
      }
      onSignedUp(value.email);
    },
    validators: {
      onSubmit: z.object({
        email: z.email(validation.emailInvalid),
        name: z.string().trim().min(2, validation.nameMin),
        password: z
          .string()
          .min(
            MIN_PASSWORD_LENGTH,
            formatMessage(validation.passwordMin, { min: MIN_PASSWORD_LENGTH })
          ),
      }),
    },
  });

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  return (
    <AuthCard
      description={signUp.description}
      footer={
        <>
          {signUp.switchPrompt}{" "}
          <Button
            className="h-auto p-0"
            onClick={onSwitchToSignIn}
            variant="link"
          >
            {signUp.switchAction}
          </Button>
        </>
      }
      title={signUp.title}
    >
      {social}
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        {submitError ? (
          <AuthErrorAlert message={submitError} title={messages.errors.title} />
        ) : null}
        <form.AppForm>
          <FieldGroup className="gap-4">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  autoComplete="name"
                  label={fields.name}
                  placeholder={fields.namePlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  autoComplete="email"
                  label={fields.email}
                  placeholder={fields.emailPlaceholder}
                  type="email"
                />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.PasswordField
                  autoComplete="new-password"
                  hideLabel={fields.hidePassword}
                  label={fields.password}
                  placeholder={formatMessage(fields.passwordPlaceholder, {
                    min: MIN_PASSWORD_LENGTH,
                  })}
                  showLabel={fields.showPassword}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.SubmitButton
            label={signUp.submit}
            pendingLabel={signUp.submitting}
          />
        </form.AppForm>
      </form>
    </AuthCard>
  );
}
