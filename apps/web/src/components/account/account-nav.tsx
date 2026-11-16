"use client";

import { cn } from "@roundcut/ui/lib/utils";
import {
  Building2Icon,
  MonitorSmartphoneIcon,
  RepeatIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Messages } from "@/i18n/messages";

const SECTIONS = [
  { href: "/account/workspace", icon: Building2Icon, key: "workspace" },
  { href: "/account/terms", icon: RepeatIcon, key: "terms" },
  { href: "/account/team", icon: UsersIcon, key: "team" },
  { href: "/account/security", icon: ShieldCheckIcon, key: "security" },
  { href: "/account/sessions", icon: MonitorSmartphoneIcon, key: "sessions" },
] as const;

export function AccountNav({
  label,
  messages,
}: {
  label: string;
  messages: Messages["account"]["menu"];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="-mx-1 overflow-x-auto px-1 pb-1 md:mx-0 md:w-52 md:shrink-0 md:overflow-visible md:p-0"
    >
      <ul className="flex w-max gap-1 md:w-full md:flex-col">
        {SECTIONS.map(({ href, icon: Icon, key }) => {
          const active = pathname === href;
          return (
            <li key={key}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 font-medium text-sm transition-colors hover:bg-muted",
                  active ? "bg-muted" : "text-muted-foreground"
                )}
                href={href}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="truncate">{messages[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
