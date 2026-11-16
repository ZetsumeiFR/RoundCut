"use client";

import { Button } from "@roundcut/ui/components/button";
import { useCallback, useState } from "react";

import type { Messages } from "@/i18n/messages";

import { CheckEmail } from "./check-email";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

type AuthView =
  | { name: "sign-in" }
  | { name: "sign-up" }
  | { name: "check-email"; email: string };

export function AuthScreen({ messages }: { messages: Messages["auth"] }) {
  const [view, setView] = useState<AuthView>({ name: "sign-up" });
  const showSignIn = useCallback(() => setView({ name: "sign-in" }), []);
  const showSignUp = useCallback(() => setView({ name: "sign-up" }), []);
  const showCheckEmail = useCallback(
    (email: string) => setView({ email, name: "check-email" }),
    []
  );

  if (view.name === "check-email") {
    return (
      <CheckEmail
        email={view.email}
        footer={
          <Button className="h-auto p-0" onClick={showSignIn} variant="link">
            {messages.checkEmail.back}
          </Button>
        }
        messages={messages}
      />
    );
  }

  if (view.name === "sign-in") {
    return <SignInForm messages={messages} onSwitchToSignUp={showSignUp} />;
  }

  return (
    <SignUpForm
      messages={messages}
      onSignedUp={showCheckEmail}
      onSwitchToSignIn={showSignIn}
    />
  );
}
