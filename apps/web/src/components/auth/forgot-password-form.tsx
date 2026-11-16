"use client";

import { FieldGroup } from "@roundcut/ui/components/field";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import z from "zod";

import { formatMessage, type Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { authErrorMessage } from "./auth-error";
import { AuthErrorAlert } from "./auth-error-alert";
import { useAppForm } from "./auth-form";

export function ForgotPasswordForm({
  messages,
  footer,
}: {
  messages: Messages["auth"];
  footer: ReactNode;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { fields, validation, forgotPassword } = messages;

  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      // Better-Auth answers the same way whether the account exists or not.
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setSubmitError(authErrorMessage(error, messages.errors));
        return;
      }
      setSentTo(value.email);
    },
    validators: {
      onSubmit: z.object({ email: z.email(validation.emailInvalid) }),
    },
  });

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  if (sentTo) {
    return (
      <AuthCard
        description={formatMessage(forgotPassword.sentDescription, {
          email: sentTo,
        })}
        footer={footer}
        title={forgotPassword.sentTitle}
      />
    );
  }

  return (
    <AuthCard
      description={forgotPassword.description}
      footer={footer}
      title={forgotPassword.title}
    >
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        {submitError ? (
          <AuthErrorAlert message={submitError} title={messages.errors.title} />
        ) : null}
        <form.AppForm>
          <FieldGroup className="gap-4">
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
          </FieldGroup>
          <form.SubmitButton
            label={forgotPassword.submit}
            pendingLabel={forgotPassword.submitting}
          />
        </form.AppForm>
      </form>
    </AuthCard>
  );
}
