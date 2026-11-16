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

  // Fields under 16px make mobile Safari zoom in on focus (REV-08).
  return (
    <main className="mx-auto flex min-h-svh w-full min-w-0 max-w-4xl flex-col gap-4 px-4 py-4 sm:px-8 sm:py-8 pointer-coarse:[&_input]:text-base pointer-coarse:[&_textarea]:text-base">
      <ClientReviewView
        locale={locale}
        messages={messages.review}
        player={messages.projects.player}
        token={token}
      />
    </main>
  );
}
