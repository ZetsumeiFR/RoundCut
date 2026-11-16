import type { Metadata } from "next";

import { ClientReviewView } from "@/components/review/client-review-view";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";

// The token is the only key to the review: keep it out of the Referer sent
// to the video storage and out of search engines.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { follow: false, index: false },
};

export default async function ClientReviewPage({
  params,
}: PageProps<"/r/[token]">) {
  const [{ token }, locale] = await Promise.all([params, getLocale()]);
  const messages = getMessages(locale);

  return (
    <main className="mx-auto flex min-h-svh w-full min-w-0 max-w-4xl flex-col gap-4 px-4 py-4 sm:px-8 sm:py-8">
      <ClientReviewView
        locale={locale}
        messages={messages.review}
        player={messages.projects.player}
        token={token}
      />
    </main>
  );
}
