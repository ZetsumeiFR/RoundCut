"use client";

import { Button } from "@roundcut/ui/components/button";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

export function StaleSession({
  messages,
}: {
  messages: Messages["account"]["sessions"];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const signInAgain = useCallback(
    () =>
      startTransition(async () => {
        await authClient.signOut();
        router.push("/login?view=sign-in");
      }),
    [router]
  );

  return (
    <AuthCard
      description={messages.staleDescription}
      title={messages.staleTitle}
    >
      <Button className="w-full" disabled={isPending} onClick={signInAgain}>
        {isPending ? messages.signingOut : messages.signInAgain}
      </Button>
    </AuthCard>
  );
}
