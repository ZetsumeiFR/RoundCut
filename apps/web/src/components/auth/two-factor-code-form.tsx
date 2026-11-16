"use client";

import { FieldGroup } from "@roundcut/ui/components/field";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import z from "zod";

import { AuthErrorAlert } from "./auth-error-alert";
import { useAppForm } from "./auth-form";

export type TwoFactorCodeKind = "totp" | "backup";

const CODE_PATTERNS: Record<TwoFactorCodeKind, RegExp> = {
  backup: /^[a-z0-9]{5}-[a-z0-9]{5}$/i,
  totp: /^\d{6}$/,
};

// Resolves to an error message, or null once the code is accepted.
export type VerifyCode = (code: string) => Promise<string | null>;

export function TwoFactorCodeForm({
  children,
  errorTitle,
  invalidMessage,
  kind,
  label,
  onVerify,
  pendingLabel,
  submitLabel,
}: {
  children?: ReactNode;
  errorTitle: string;
  invalidMessage: string;
  kind: TwoFactorCodeKind;
  label: string;
  onVerify: VerifyCode;
  pendingLabel: string;
  submitLabel: string;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { code: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      setSubmitError(await onVerify(value.code.trim()));
    },
    validators: {
      onSubmit: z.object({
        code: z.string().trim().regex(CODE_PATTERNS[kind], invalidMessage),
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
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      {submitError ? (
        <AuthErrorAlert message={submitError} title={errorTitle} />
      ) : null}
      <form.AppForm>
        <FieldGroup className="gap-4">
          <form.AppField name="code">
            {(field) => (
              <field.TextField
                autoCapitalize="none"
                autoComplete="one-time-code"
                autoCorrect="off"
                className="font-mono tracking-widest"
                inputMode={kind === "totp" ? "numeric" : "text"}
                label={label}
                placeholder={kind === "totp" ? "123456" : "abcde-12345"}
                spellCheck={false}
              />
            )}
          </form.AppField>
          {children}
        </FieldGroup>
        <form.SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
      </form.AppForm>
    </form>
  );
}
