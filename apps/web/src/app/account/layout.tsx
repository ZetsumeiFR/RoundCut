import type { ReactNode } from "react";

import { AccountNav } from "@/components/account/account-nav";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { account } = getMessages(await getLocale());

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-semibold text-xl tracking-tight">
          {account.nav.title}
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          {account.nav.description}
        </p>
      </header>
      <div className="flex flex-col gap-4 md:flex-row lg:gap-8">
        <AccountNav label={account.nav.label} messages={account.menu} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
