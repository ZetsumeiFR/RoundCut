import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TeamSettings } from "@/components/account/team-settings";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function TeamPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const locale = await getLocale();

  return (
    <TeamSettings
      locale={locale}
      messages={getMessages(locale).account.team}
      userId={session.user.id}
    />
  );
}
