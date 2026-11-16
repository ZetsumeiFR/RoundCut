"use client";
import Link from "next/link";

import type { Messages } from "@/i18n/messages";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header({
  menuMessages,
}: {
  menuMessages: Messages["account"]["menu"];
}) {
  const links = [
    { label: "Home", to: "/" },
    { label: "Dashboard", to: "/dashboard" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => (
            <Link href={to} key={to}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu messages={menuMessages} />
        </div>
      </div>
      <hr />
    </div>
  );
}
