import { isGoogleSignInEnabled } from "@roundcut/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { googleErrorMessage } from "@/components/auth/auth-error";
import { AuthScreen } from "@/components/auth/auth-screen";
import { isInitialAuthView } from "@/components/auth/auth-view";
import { ENV } from "@/env.server";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.emailVerified) {
    redirect("/dashboard");
  }

  const messages = getMessages(await getLocale());
  const { error, view } = await searchParams;

  return (
    <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
      <AuthScreen
        googleError={
          typeof error === "string"
            ? googleErrorMessage(error, messages.auth.errors)
            : null
        }
        googleSignIn={isGoogleSignInEnabled(ENV)}
        initialView={isInitialAuthView(view) ? view : "sign-up"}
        messages={messages.auth}
      />
    </main>
  );
}
