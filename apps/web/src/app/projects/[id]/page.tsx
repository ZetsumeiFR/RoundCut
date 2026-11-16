import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProjectView } from "@/components/projects/project-view";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[id]">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <ProjectView
        locale={locale}
        messages={messages.projects}
        projectId={id}
        terms={messages.account.terms}
      />
    </main>
  );
}
