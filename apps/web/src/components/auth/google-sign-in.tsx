"use client";

import { Button } from "@roundcut/ui/components/button";
import { Separator } from "@roundcut/ui/components/separator";
import { useCallback, useState } from "react";

import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthErrorAlert } from "./auth-error-alert";
import type { InitialAuthView } from "./auth-view";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignIn({
  initialError,
  messages,
  view,
}: {
  initialError: string | null;
  messages: Messages["auth"];
  view: InitialAuthView;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const { google } = messages;

  const signIn = useCallback(async () => {
    setError(null);
    setPending(true);
    const { origin } = window.location;
    // On success the client follows the redirect to Google, so the button stays pending.
    const { error: signInError } = await authClient.signIn.social({
      callbackURL: `${origin}/dashboard`,
      errorCallbackURL: `${origin}/login?view=${view}`,
      newUserCallbackURL: `${origin}/onboarding`,
      provider: "google",
    });
    if (signInError) {
      setError(messages.errors.googleFailed);
      setPending(false);
    }
  }, [messages.errors.googleFailed, view]);

  return (
    <>
      {error ? (
        <AuthErrorAlert message={error} title={messages.errors.title} />
      ) : null}
      <Button
        className="w-full"
        disabled={pending}
        onClick={signIn}
        type="button"
        variant="outline"
      >
        <GoogleLogo />
        {pending ? google.redirecting : google.continue}
      </Button>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">
          {google.separator}
        </span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
