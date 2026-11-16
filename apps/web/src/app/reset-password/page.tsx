import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  const messages = getMessages(await getLocale());
  const validToken = typeof token === "string" && !error ? token : null;

  return (
    <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
      <ResetPasswordForm messages={messages.auth} token={validToken} />
    </main>
  );
}
