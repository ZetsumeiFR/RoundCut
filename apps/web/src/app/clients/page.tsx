import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ClientsView } from "@/components/clients/clients-view";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function ClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <ClientsView
        locale={locale}
        messages={messages.clients}
        terms={messages.account.terms}
      />
    </main>
  );
}
