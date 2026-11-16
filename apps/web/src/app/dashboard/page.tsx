import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { createServerApi } from "@/lib/server-api";
import { auth } from "@/services";
import Dashboard from "./dashboard";

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
  const [locale, workspace, clients] = await Promise.all([
    getLocale(),
    api.workspace.get(),
    api.client.list(),
  ]);

  return (
    <main className="flex w-full min-w-0 flex-col gap-6 px-4 py-6 sm:px-8">
      <div className="w-full max-w-3xl">
        <SetupChecklist
          hasClient={clients.length > 0}
          messages={getMessages(locale).dashboard.checklist}
          setupDone={workspace.onboardingCompletedAt !== null}
        />
      </div>
      <div>
        <h1>Dashboard</h1>
        <p>Welcome {session.user.name}</p>
        <Dashboard session={session} />
      </div>
    </main>
  );
}
