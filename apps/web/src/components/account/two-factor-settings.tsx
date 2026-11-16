"use client";

import { Button } from "@roundcut/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@roundcut/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import { FieldGroup } from "@roundcut/ui/components/field";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import QRCode from "react-qr-code";
import z from "zod";

import { authErrorMessage } from "@/components/auth/auth-error";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import {
  TwoFactorCodeForm,
  type VerifyCode,
} from "@/components/auth/two-factor-code-form";
import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

type SecurityMessages = Messages["account"]["security"];
type AuthMessages = Messages["auth"];
type PasswordAction = "enable" | "disable" | "backup-codes";

type Step =
  | { name: "idle" }
  | { name: "password"; action: PasswordAction }
  | { name: "scan"; backupCodes: string[]; totpURI: string }
  | { name: "backup-codes"; codes: string[] };

const QR_SIZE = 176;

function StepHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-medium text-sm">{title}</h2>
      <p className="text-pretty text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function PasswordForm({
  authMessages,
  messages,
  onCancel,
  onConfirm,
}: {
  authMessages: AuthMessages;
  messages: SecurityMessages;
  onCancel: () => void;
  onConfirm: VerifyCode;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { errors, fields, validation } = authMessages;

  const form = useAppForm({
    defaultValues: { password: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      setSubmitError(await onConfirm(value.password));
    },
    validators: {
      onSubmit: z.object({
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
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      <p className="text-muted-foreground text-sm">
        {messages.confirmPassword}
      </p>
      {submitError ? (
        <AuthErrorAlert message={submitError} title={errors.title} />
      ) : null}
      <form.AppForm>
        <FieldGroup className="gap-4">
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
        <form.SubmitButton
          label={messages.confirm}
          pendingLabel={messages.confirming}
        />
      </form.AppForm>
      <Button onClick={onCancel} type="button" variant="ghost">
        {messages.cancel}
      </Button>
    </form>
  );
}

function ScanStep({
  errorTitle,
  messages,
  onCancel,
  onVerify,
  totpURI,
}: {
  errorTitle: string;
  messages: SecurityMessages;
  onCancel: () => void;
  onVerify: VerifyCode;
  totpURI: string;
}) {
  const secret = new URL(totpURI).searchParams.get("secret");

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        description={messages.scanDescription}
        title={messages.scanTitle}
      />
      <div className="self-center bg-white p-3">
        <QRCode size={QR_SIZE} title={messages.qrLabel} value={totpURI} />
      </div>
      {secret ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs">{messages.manualKey}</p>
          <code className="break-all bg-muted px-2 py-1.5 font-mono text-xs">
            {secret}
          </code>
        </div>
      ) : null}
      <TwoFactorCodeForm
        errorTitle={errorTitle}
        invalidMessage={messages.codeInvalid}
        kind="totp"
        label={messages.code}
        onVerify={onVerify}
        pendingLabel={messages.verifying}
        submitLabel={messages.verify}
      />
      <Button onClick={onCancel} type="button" variant="ghost">
        {messages.cancel}
      </Button>
    </div>
  );
}

function BackupCodes({
  codes,
  messages,
  onDone,
}: {
  codes: string[];
  messages: SecurityMessages;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        description={messages.backupCodesDescription}
        title={messages.backupCodesTitle}
      />
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((code) => (
          <li className="bg-muted px-3 py-2 text-center" key={code}>
            {code}
          </li>
        ))}
      </ul>
      <Button className="self-end" onClick={onDone}>
        {messages.done}
      </Button>
    </div>
  );
}

function IdleActions({
  enabled,
  messages,
  onAction,
}: {
  enabled: boolean;
  messages: SecurityMessages;
  onAction: (action: PasswordAction) => void;
}) {
  const enable = useCallback(() => onAction("enable"), [onAction]);
  const regenerate = useCallback(() => onAction("backup-codes"), [onAction]);
  const disable = useCallback(() => onAction("disable"), [onAction]);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-pretty text-muted-foreground text-sm">
        {enabled ? messages.onDescription : messages.offDescription}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {enabled ? (
          <>
            <Button onClick={regenerate} variant="outline">
              {messages.regenerateCodes}
            </Button>
            <Button onClick={disable} variant="destructive">
              {messages.disable}
            </Button>
          </>
        ) : (
          <Button onClick={enable}>{messages.enable}</Button>
        )}
      </div>
    </div>
  );
}

export function TwoFactorSettings({
  authMessages,
  enabled,
  hasPassword,
  messages,
}: {
  authMessages: AuthMessages;
  enabled: boolean;
  hasPassword: boolean;
  messages: SecurityMessages;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const { errors } = authMessages;

  const showIdle = useCallback(() => setStep({ name: "idle" }), []);
  const askPassword = useCallback(
    (action: PasswordAction) => setStep({ action, name: "password" }),
    []
  );

  const confirmPassword = useCallback(
    async (password: string) => {
      if (step.name !== "password") {
        return null;
      }
      if (step.action === "enable") {
        const { data, error } = await authClient.twoFactor.enable({
          password,
        });
        if (error) {
          return authErrorMessage(error, errors);
        }
        if (!("totpURI" in data)) {
          return errors.generic;
        }
        setStep({
          backupCodes: data.backupCodes,
          name: "scan",
          totpURI: data.totpURI,
        });
        return null;
      }
      if (step.action === "disable") {
        const { error } = await authClient.twoFactor.disable({ password });
        if (error) {
          return authErrorMessage(error, errors);
        }
        setStep({ name: "idle" });
        router.refresh();
        return null;
      }
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password,
      });
      if (error) {
        return authErrorMessage(error, errors);
      }
      setStep({ codes: data.backupCodes, name: "backup-codes" });
      return null;
    },
    [errors, router, step]
  );

  // Enrollment stays pending until the first code from the app is verified.
  const verifyEnrollment = useCallback(
    async (code: string) => {
      if (step.name !== "scan") {
        return null;
      }
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        return authErrorMessage(error, errors);
      }
      setStep({ codes: step.backupCodes, name: "backup-codes" });
      router.refresh();
      return null;
    },
    [errors, router, step]
  );

  let body: ReactNode;
  if (!hasPassword) {
    body = (
      <Empty className="border p-6 md:p-8">
        <EmptyHeader>
          <EmptyTitle>{messages.noPasswordTitle}</EmptyTitle>
          <EmptyDescription>{messages.noPasswordDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (step.name === "password") {
    body = (
      <PasswordForm
        authMessages={authMessages}
        key={step.action}
        messages={messages}
        onCancel={showIdle}
        onConfirm={confirmPassword}
      />
    );
  } else if (step.name === "scan") {
    body = (
      <ScanStep
        errorTitle={errors.title}
        messages={messages}
        onCancel={showIdle}
        onVerify={verifyEnrollment}
        totpURI={step.totpURI}
      />
    );
  } else if (step.name === "backup-codes") {
    body = (
      <BackupCodes codes={step.codes} messages={messages} onDone={showIdle} />
    );
  } else {
    body = (
      <IdleActions
        enabled={enabled}
        messages={messages}
        onAction={askPassword}
      />
    );
  }

  return (
    <Card className="w-full gap-0 p-0">
      <CardHeader className="gap-1.5 border-b px-6 py-6">
        <CardTitle>
          <h1 className="font-semibold text-xl">{messages.title}</h1>
        </CardTitle>
        <CardDescription className="text-sm">
          {messages.description}
        </CardDescription>
        <CardAction>
          <Badge variant={enabled ? "success-light" : "secondary"}>
            {enabled ? messages.on : messages.off}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-6 py-6">{body}</CardContent>
    </Card>
  );
}
