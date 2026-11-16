import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProjectsDashboard } from "@/components/dashboard/projects-dashboard";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { createServerApi } from "@/lib/server-api";
import { auth } from "@/services";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const api = createServerApi(session);
  const [locale, workspace, clients, projects] = await Promise.all([
    getLocale(),
    api.workspace.get(),
    api.client.list(),
    api.project.list(),
  ]);
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="sr-only">{messages.dashboard.title}</h1>
      <div className="w-full max-w-3xl">
        <SetupChecklist
          hasClient={clients.length > 0}
          hasProject={projects.length > 0}
          locale={locale}
          messages={messages.dashboard.checklist}
          setupDone={workspace.onboardingCompletedAt !== null}
        />
      </div>
      <ProjectsDashboard
        locale={locale}
        messages={messages.dashboard.projects}
        projectsMessages={messages.projects}
      />
    </main>
  );
}
