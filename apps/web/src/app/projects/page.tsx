import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProjectsView } from "@/components/projects/projects-view";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function ProjectsPage() {
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
      <ProjectsView
        locale={locale}
        messages={messages.projects}
        terms={messages.account.terms}
      />
    </main>
  );
}
