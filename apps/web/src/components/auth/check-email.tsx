"use client";

import { Button } from "@roundcut/ui/components/button";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { CircleCheckIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { authErrorMessage } from "./auth-error";
import { AuthErrorAlert } from "./auth-error-alert";

type ResendState = "idle" | "sending" | "sent" | "error";

export function CheckEmail({
  description,
  email,
  messages,
  footer,
}: {
  description?: string;
  email: string;
  messages: Messages["auth"];
  footer?: ReactNode;
}) {
  const [state, setState] = useState<ResendState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const { checkEmail } = messages;

  const resend = useCallback(async () => {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({
      callbackURL: `${window.location.origin}/onboarding`,
      email,
    });
    if (error) {
      setErrorMessage(authErrorMessage(error, messages.errors));
      setState("error");
      return;
    }
    setState("sent");
  }, [email, messages.errors]);

  return (
    <AuthCard
      description={formatMessage(description ?? checkEmail.description, {
        email,
      })}
      footer={footer}
      title={checkEmail.title}
    >
      {state === "sent" ? (
        <Alert>
          <CircleCheckIcon aria-hidden="true" />
          <AlertDescription>{checkEmail.resent}</AlertDescription>
        </Alert>
      ) : null}
      {state === "error" ? (
        <AuthErrorAlert message={errorMessage} title={messages.errors.title} />
      ) : null}
      <Button
        className="w-full"
        disabled={state === "sending"}
        onClick={resend}
        variant="outline"
      >
        {state === "sending" ? checkEmail.resending : checkEmail.resend}
      </Button>
    </AuthCard>
  );
}
