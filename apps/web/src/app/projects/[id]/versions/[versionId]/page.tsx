import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ReviewView } from "@/components/review/review-view";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function VersionReviewPage({
  params,
}: PageProps<"/projects/[id]/versions/[versionId]">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const [{ id, versionId }, locale] = await Promise.all([params, getLocale()]);
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6">
      <ReviewView
        locale={locale}
        messages={messages.projects}
        projectId={id}
        versionId={versionId}
      />
    </main>
  );
}
