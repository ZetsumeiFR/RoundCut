"use client";
import type { Locale } from "@roundcut/auth/locale";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { ModeToggle } from "./mode-toggle";
import NotificationBell from "./notification-bell";
import UserMenu from "./user-menu";

export default function Header({
  locale,
  menuMessages,
  notificationMessages,
}: {
  locale: Locale;
  menuMessages: Messages["account"]["menu"];
  notificationMessages: Messages["notifications"];
}) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  // Client review pages (/r/[token]) stand alone, without the app shell.
  if (pathname.startsWith("/r/")) {
    return null;
  }

  const links = [
    { label: "Home", to: "/" },
    { label: "Dashboard", to: "/dashboard" },
    { label: "Clients", to: "/clients" },
    { label: "Projects", to: "/projects" },
    { label: "Billing", to: "/billing" },
  ] as const;

  return (
    <div className="min-w-0">
      <div className="flex flex-row items-center justify-between gap-2 px-2 py-1">
        <nav className="flex min-w-0 gap-2 overflow-x-auto whitespace-nowrap text-sm sm:gap-4 sm:text-lg">
          {links.map(({ to, label }) => (
            <Link href={to} key={to}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {session ? (
            <NotificationBell locale={locale} messages={notificationMessages} />
          ) : null}
          <ModeToggle />
          <UserMenu messages={menuMessages} />
        </div>
      </div>
      <hr />
    </div>
  );
}
