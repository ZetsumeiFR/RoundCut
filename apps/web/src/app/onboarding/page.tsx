import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CheckEmail } from "@/components/auth/check-email";
import { Onboarding } from "@/components/onboarding/onboarding";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { createServerApi } from "@/lib/server-api";
import { auth } from "@/services";

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const locale = await getLocale();
  const messages = getMessages(locale);

  if (!session.user.emailVerified) {
    return (
      <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <CheckEmail email={session.user.email} messages={messages.auth} />
      </main>
    );
  }

  const workspace = await createServerApi(session).workspace.get();
  if (workspace.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  return (
    <Onboarding
      locale={locale}
      messages={{
        onboarding: messages.onboarding,
        terms: messages.account.terms,
        workspace: messages.account.workspace,
      }}
    />
  );
}
