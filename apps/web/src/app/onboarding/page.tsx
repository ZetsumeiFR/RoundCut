import { Button } from "@roundcut/ui/components/button";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { CheckEmail } from "@/components/auth/check-email";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const messages = getMessages(await getLocale());

  return (
    <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
      {session.user.emailVerified ? (
        <AuthCard
          description={messages.onboarding.description}
          title={messages.onboarding.title}
        >
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link href="/dashboard" />}
          >
            {messages.onboarding.continue}
          </Button>
        </AuthCard>
      ) : (
        <CheckEmail email={session.user.email} messages={messages.auth} />
      )}
    </main>
  );
}
