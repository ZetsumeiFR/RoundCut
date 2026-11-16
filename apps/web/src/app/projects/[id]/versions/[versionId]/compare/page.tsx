import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CompareView } from "@/components/review/compare-view";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function VersionComparePage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/versions/[versionId]/compare">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const [{ id, versionId }, query, locale] = await Promise.all([
    params,
    searchParams,
    getLocale(),
  ]);
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6">
      <CompareView
        locale={locale}
        messages={messages.projects}
        projectId={id}
        versionId={versionId}
        withId={typeof query.with === "string" ? query.with : undefined}
      />
    </main>
  );
}
