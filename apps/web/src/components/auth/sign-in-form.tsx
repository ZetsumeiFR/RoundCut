"use client";

import { Button } from "@roundcut/ui/components/button";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import z from "zod";

import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { authErrorMessage } from "./auth-error";
import { AuthErrorAlert } from "./auth-error-alert";
import { useAppForm } from "./auth-form";

export function SignInForm({
  messages,
  onEmailNotVerified,
  onForgotPassword,
  onSwitchToSignUp,
  social,
}: {
  messages: Messages["auth"];
  onEmailNotVerified: (email: string) => void;
  onForgotPassword: () => void;
  onSwitchToSignUp: () => void;
  social?: ReactNode;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { fields, validation, signIn } = messages;

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const { error } = await authClient.signIn.email({
        // Used by the verification link Better-Auth re-sends to unverified users.
        callbackURL: `${window.location.origin}/dashboard`,
        email: value.email,
        password: value.password,
      });
      if (error?.code === "EMAIL_NOT_VERIFIED") {
        onEmailNotVerified(value.email);
        return;
      }
      if (error) {
        setSubmitError(authErrorMessage(error, messages.errors));
        return;
      }
      router.push("/dashboard");
    },
    validators: {
      onSubmit: z.object({
        email: z.email(validation.emailInvalid),
        password: z.string().min(1, validation.passwordRequired),
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
      description={signIn.description}
      footer={
        <>
          {signIn.switchPrompt}{" "}
          <Button
            className="h-auto p-0"
            onClick={onSwitchToSignUp}
            variant="link"
          >
            {signIn.switchAction}
          </Button>
        </>
      }
      title={signIn.title}
    >
      {social}
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
            <form.AppField name="password">
              {(field) => (
                <field.PasswordField
                  autoComplete="current-password"
                  hideLabel={fields.hidePassword}
                  label={fields.password}
                  showLabel={fields.showPassword}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <Button
            className="-mt-2 h-auto self-end p-0"
            onClick={onForgotPassword}
            type="button"
            variant="link"
          >
            {signIn.forgotPassword}
          </Button>
          <form.SubmitButton
            label={signIn.submit}
            pendingLabel={signIn.submitting}
          />
        </form.AppForm>
      </form>
    </AuthCard>
  );
}
