"use client";

import type {
  NotificationChannel,
  NotificationPreferences,
  NotificationType,
} from "@roundcut/db/notification";
import { Card, CardContent } from "@roundcut/ui/components/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@roundcut/ui/components/item";
import { Separator } from "@roundcut/ui/components/separator";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { Switch } from "@roundcut/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, InfoIcon, MailIcon } from "lucide-react";
import { Fragment, type ReactNode, useCallback } from "react";
import { toast } from "sonner";

import type { Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";
import { SettingsLoadError } from "./settings-form";

type NotificationSettingsMessages = Messages["account"]["notifications"];

const CHANNELS: { icon: typeof BellIcon; id: NotificationChannel }[] = [
  { icon: MailIcon, id: "email" },
  { icon: BellIcon, id: "in_app" },
];

// In the order a project goes through them.
const TYPES: NotificationType[] = [
  "comment",
  "batch_submitted",
  "extra_round_proposed",
  "extra_round_accepted",
  "payment_received",
  "version_approved",
];

function NotificationRow({
  control,
  description,
  media,
  title,
}: {
  control?: ReactNode;
  description: string;
  media?: ReactNode;
  title: string;
}) {
  return (
    <Item size="sm">
      {media ? (
        <ItemMedia className="flex size-10 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-5">
          {media}
        </ItemMedia>
      ) : null}
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {description}
        </ItemDescription>
      </ItemContent>
      {control ? (
        <ItemActions className="w-auto shrink-0">{control}</ItemActions>
      ) : null}
    </Item>
  );
}

function PreferenceSwitch({
  channel,
  checked,
  label,
  onChange,
  type,
}: {
  channel: NotificationChannel;
  checked: boolean;
  label: string;
  onChange: (change: {
    channel: NotificationChannel;
    enabled: boolean;
    type: NotificationType;
  }) => void;
  type: NotificationType;
}) {
  const handleChange = useCallback(
    (enabled: boolean) => onChange({ channel, enabled, type }),
    [channel, onChange, type]
  );
  return (
    <Switch
      aria-label={label}
      checked={checked}
      onCheckedChange={handleChange}
      size="sm"
    />
  );
}

export function NotificationSettingsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      {CHANNELS.map(({ id }) => (
        <Card className="gap-0 p-0" key={id}>
          <CardContent className="flex flex-col gap-5 px-4 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            </div>
            {TYPES.map((type) => (
              <div className="flex items-center gap-3 pl-11" key={type}>
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-3.5 w-6" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Which client activity reaches the editor, by email and in the app
// (NOTIF-03). Each switch saves at once.
export function NotificationSettings({
  messages,
}: {
  messages: NotificationSettingsMessages;
}) {
  const queryClient = useQueryClient();
  const queryKey = orpc.notification.preferences.get.queryKey();
  const preferences = useQuery(
    orpc.notification.preferences.get.queryOptions()
  );
  const { mutate } = useMutation(
    orpc.notification.preferences.update.mutationOptions({
      onError: () => {
        // Back to what the server holds.
        queryClient.invalidateQueries({ queryKey });
        toast.error(messages.saveError);
      },
      onMutate: async ({ channel, enabled, type }) => {
        await queryClient.cancelQueries({ queryKey });
        const previous =
          queryClient.getQueryData<NotificationPreferences>(queryKey);
        if (previous) {
          queryClient.setQueryData(queryKey, {
            ...previous,
            [type]: { ...previous[type], [channel]: enabled },
          });
        }
      },
      onSuccess: (saved) => {
        queryClient.setQueryData(queryKey, saved);
        // The center hides the types turned off in the app.
        queryClient.invalidateQueries({
          queryKey: orpc.notification.list.key(),
        });
      },
    })
  );
  const handleChange = useCallback(
    (change: {
      channel: NotificationChannel;
      enabled: boolean;
      type: NotificationType;
    }) => mutate(change),
    [mutate]
  );
  const { refetch } = preferences;
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (preferences.isError) {
    return <SettingsLoadError messages={messages} onRetry={handleRetry} />;
  }
  const values = preferences.data;
  if (!values) {
    return <NotificationSettingsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-3">
      {CHANNELS.map(({ icon: Icon, id: channel }) => {
        const channelMessages = messages.channels[channel];
        return (
          <Card className="gap-0 p-0" key={channel}>
            <CardContent className="p-0">
              <NotificationRow
                description={channelMessages.description}
                media={<Icon aria-hidden="true" />}
                title={channelMessages.title}
              />
              <Separator />
              {TYPES.map((type, index) => (
                <Fragment key={type}>
                  {index > 0 ? <Separator /> : null}
                  <div className="pl-12.5">
                    <NotificationRow
                      control={
                        <PreferenceSwitch
                          channel={channel}
                          checked={values[type][channel]}
                          label={`${messages.types[type].title} · ${channelMessages.title}`}
                          onChange={handleChange}
                          type={type}
                        />
                      }
                      description={messages.types[type].description}
                      title={messages.types[type].title}
                    />
                  </div>
                </Fragment>
              ))}
            </CardContent>
          </Card>
        );
      })}
      <p className="flex items-start gap-2 px-1 text-muted-foreground text-xs">
        <InfoIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        {messages.alwaysSent}
      </p>
    </div>
  );
}
