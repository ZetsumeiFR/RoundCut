"use client";
import type { Locale } from "@roundcut/auth/locale";
import type { NotificationType } from "@roundcut/db/notification";
import { Button } from "@roundcut/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@roundcut/ui/components/popover";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { cn } from "@roundcut/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheckIcon,
  BellIcon,
  CircleAlertIcon,
  CreditCardIcon,
  HandshakeIcon,
  MessageSquareIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client, orpc } from "@/utils/orpc";

type NotificationMessages = Messages["notifications"];
type NotificationItem = Awaited<
  ReturnType<typeof client.notification.list>
>["items"][number];

const REFRESH_INTERVAL_MS = 60_000;
const BADGE_MAX = 9;
const SKELETON_ROWS = ["first", "second", "third"] as const;

const TYPE_ICONS: Record<NotificationType, typeof BellIcon> = {
  batch_submitted: SendIcon,
  comment: MessageSquareIcon,
  extra_round_accepted: HandshakeIcon,
  extra_round_proposed: SparklesIcon,
  payment_received: CreditCardIcon,
  version_approved: BadgeCheckIcon,
};

const RELATIVE_UNITS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
] as const;

const relativeTime = (date: Date, locale: Locale, now: number) => {
  const seconds = Math.round((date.getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "minute");
};

const titleOf = (item: NotificationItem, messages: NotificationMessages) => {
  const { payload } = item;
  const template =
    item.type === "comment" && payload.reply
      ? messages.types.reply
      : messages.types[item.type];
  return formatMessage(template, {
    actor: payload.actorName,
    deliverable: payload.deliverableTitle,
    round: payload.roundNumber ?? "",
    version: payload.versionNumber,
  });
};

function NotificationRow({
  item,
  locale,
  messages,
  now,
  onOpen,
}: {
  item: NotificationItem;
  locale: Locale;
  messages: NotificationMessages;
  now: number;
  onOpen: (item: NotificationItem) => void;
}) {
  const Icon = TYPE_ICONS[item.type];
  const unread = item.readAt === null;
  const open = useCallback(() => onOpen(item), [item, onOpen]);
  const createdAt = new Date(item.createdAt);

  return (
    <li>
      <button
        className={cn(
          "flex w-full items-start gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
          unread && "bg-primary/5"
        )}
        onClick={open}
        type="button"
      >
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("text-xs", unread && "font-medium")}>
            {titleOf(item, messages)}
          </span>
          {item.payload.body ? (
            <span className="line-clamp-2 text-muted-foreground text-xs">
              {item.payload.body}
            </span>
          ) : null}
          <span className="text-muted-foreground text-xs">
            {item.payload.projectName} ·{" "}
            <time dateTime={createdAt.toISOString()}>
              {relativeTime(createdAt, locale, now)}
            </time>
          </span>
        </span>
        {unread ? (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">{messages.unread}</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}

function NotificationList({
  locale,
  messages,
  onOpen,
}: {
  locale: Locale;
  messages: NotificationMessages;
  onOpen: (item: NotificationItem) => void;
}) {
  const list = useQuery(
    orpc.notification.list.queryOptions({
      input: {},
      meta: { inlineError: true },
    })
  );
  const retry = useCallback(() => list.refetch(), [list]);

  if (list.isError) {
    return (
      <Empty className="p-4 md:p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{messages.error}</EmptyTitle>
        </EmptyHeader>
        <Button onClick={retry} size="sm" variant="outline">
          {messages.retry}
        </Button>
      </Empty>
    );
  }
  if (!list.data) {
    return (
      <ul aria-busy="true" className="flex flex-col gap-2 p-2.5">
        {SKELETON_ROWS.map((row) => (
          <li key={row}>
            <Skeleton className="h-10 w-full" />
          </li>
        ))}
      </ul>
    );
  }
  if (list.data.items.length === 0) {
    return (
      <Empty className="p-4 md:p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyTitle>{messages.empty.title}</EmptyTitle>
          <EmptyDescription>{messages.empty.description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const now = list.dataUpdatedAt;
  return (
    <ul className="flex max-h-[min(24rem,60svh)] flex-col overflow-y-auto">
      {list.data.items.map((item) => (
        <NotificationRow
          item={item}
          key={item.id}
          locale={locale}
          messages={messages}
          now={now}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

// In-app notification center (NOTIF-02): the bell shows the unread count,
// its popover lists the latest events; opening one marks it read and goes to
// the version it is about.
export default function NotificationBell({
  locale,
  messages,
}: {
  locale: Locale;
  messages: NotificationMessages;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const summary = useQuery(
    orpc.notification.list.queryOptions({
      input: {},
      meta: { inlineError: true },
      refetchInterval: REFRESH_INTERVAL_MS,
    })
  );
  const unread = summary.data?.unreadCount ?? 0;
  const badge = unread > BADGE_MAX ? `${BADGE_MAX}+` : String(unread);

  const markRead = useCallback(
    async (ids?: string[]) => {
      try {
        await client.notification.markRead({ ids });
      } catch {
        toast.error(messages.markError);
      } finally {
        await queryClient.invalidateQueries({
          queryKey: orpc.notification.key(),
        });
      }
    },
    [messages.markError, queryClient]
  );
  const openItem = useCallback(
    (item: NotificationItem) => {
      setOpen(false);
      router.push(
        `/projects/${item.payload.projectId}/versions/${item.payload.versionId}`
      );
      if (item.readAt === null) {
        markRead([item.id]);
      }
    },
    [markRead, router]
  );
  const markAll = useCallback(() => markRead(), [markRead]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={
              unread > 0
                ? formatMessage(messages.openUnread, { count: unread })
                : messages.open
            }
            className="relative"
            size="icon"
            variant="outline"
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-medium text-[0.625rem] text-white leading-none"
            data-slot="notification-count"
          >
            {badge}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-1rem))] gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
          <PopoverTitle>{messages.title}</PopoverTitle>
          <Button
            disabled={unread === 0}
            onClick={markAll}
            size="sm"
            variant="ghost"
          >
            {messages.markAllRead}
          </Button>
        </div>
        <NotificationList
          locale={locale}
          messages={messages}
          onOpen={openItem}
        />
      </PopoverContent>
    </Popover>
  );
}
