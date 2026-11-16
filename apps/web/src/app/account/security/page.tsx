import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TwoFactorSettings } from "@/components/account/two-factor-settings";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function SecurityPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const [locale, accounts] = await Promise.all([
    getLocale(),
    auth.api.listUserAccounts({ headers: requestHeaders }),
  ]);
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:px-8 sm:py-10">
      <TwoFactorSettings
        authMessages={messages.auth}
        enabled={session.user.twoFactorEnabled === true}
        hasPassword={accounts.some(
          ({ providerId }) => providerId === "credential"
        )}
        messages={messages.account.security}
      />
    </main>
  );
}
