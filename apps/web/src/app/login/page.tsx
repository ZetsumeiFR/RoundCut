import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/auth/auth-screen";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.emailVerified) {
    redirect("/dashboard");
  }

  const messages = getMessages(await getLocale());

  return (
    <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
      <AuthScreen messages={messages.auth} />
    </main>
  );
}
