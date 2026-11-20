import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { NotificationSettings } from "@/components/account/notification-settings";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function NotificationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const locale = await getLocale();

  return (
    <NotificationSettings
      messages={getMessages(locale).account.notifications}
    />
  );
}
