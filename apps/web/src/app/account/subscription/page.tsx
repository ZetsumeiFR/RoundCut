import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  type CheckoutOutcome,
  SubscriptionSettings,
} from "@/components/account/subscription-settings";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

const checkoutOutcome = (
  value: string | string[] | undefined
): CheckoutOutcome =>
  value === "success" || value === "cancel" ? value : null;

export default async function SubscriptionPage({
  searchParams,
}: PageProps<"/account/subscription">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const locale = await getLocale();
  const { checkout } = await searchParams;

  return (
    <SubscriptionSettings
      checkout={checkoutOutcome(checkout)}
      locale={locale}
      messages={getMessages(locale).account.subscription}
    />
  );
}
