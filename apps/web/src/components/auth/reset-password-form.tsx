"use client";

import { MIN_PASSWORD_LENGTH } from "@roundcut/auth/password-policy";
import { Button } from "@roundcut/ui/components/button";
import { FieldGroup } from "@roundcut/ui/components/field";
import Link from "next/link";
import { type FormEvent, useCallback, useState } from "react";
import z from "zod";

import { formatMessage, type Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { authErrorMessage } from "./auth-error";
import { AuthErrorAlert } from "./auth-error-alert";
import { useAppForm } from "./auth-form";

type ResetState = "form" | "invalid-token" | "done";

export function ResetPasswordForm({
  messages,
  token,
}: {
  messages: Messages["auth"];
  token: string | null;
}) {
  const [state, setState] = useState<ResetState>(
    token ? "form" : "invalid-token"
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { fields, validation, resetPassword } = messages;
  const passwordMin = formatMessage(validation.passwordMin, {
    min: MIN_PASSWORD_LENGTH,
  });

  const form = useAppForm({
    defaultValues: { password: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token: token ?? "",
      });
      if (error?.code === "INVALID_TOKEN") {
        setState("invalid-token");
        return;
      }
      if (error) {
        setSubmitError(
          error.code === "PASSWORD_TOO_SHORT"
            ? passwordMin
            : authErrorMessage(error, messages.errors)
        );
        return;
      }
      setState("done");
    },
    validators: {
      onSubmit: z.object({
        password: z.string().min(MIN_PASSWORD_LENGTH, passwordMin),
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

  if (state === "invalid-token") {
    return (
      <AuthCard
        description={resetPassword.invalidDescription}
        title={resetPassword.invalidTitle}
      >
        <Button
          className="w-full"
          nativeButton={false}
          render={<Link href="/login?view=forgot-password" />}
        >
          {resetPassword.requestNew}
        </Button>
      </AuthCard>
    );
  }

  if (state === "done") {
    return (
      <AuthCard
        description={resetPassword.successDescription}
        title={resetPassword.successTitle}
      >
        <Button
          className="w-full"
          nativeButton={false}
          render={<Link href="/login?view=sign-in" />}
        >
          {resetPassword.signIn}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description={resetPassword.description}
      title={resetPassword.title}
    >
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        {submitError ? (
          <AuthErrorAlert message={submitError} title={messages.errors.title} />
        ) : null}
        <form.AppForm>
          <FieldGroup className="gap-4">
            <form.AppField name="password">
              {(field) => (
                <field.PasswordField
                  autoComplete="new-password"
                  hideLabel={fields.hidePassword}
                  label={fields.newPassword}
                  placeholder={formatMessage(fields.passwordPlaceholder, {
                    min: MIN_PASSWORD_LENGTH,
                  })}
                  showLabel={fields.showPassword}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.SubmitButton
            label={resetPassword.submit}
            pendingLabel={resetPassword.submitting}
          />
        </form.AppForm>
      </form>
    </AuthCard>
  );
}
