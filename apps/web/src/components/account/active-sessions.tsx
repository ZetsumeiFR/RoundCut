"use client";

import { Button } from "@roundcut/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@roundcut/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { Separator } from "@roundcut/ui/components/separator";
import { LogOutIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

export interface ActiveSession {
  details: string[];
  device: string;
  mobile: boolean;
  token: string;
}

type SessionsMessages = Messages["account"]["sessions"];
type AuthErrors = Messages["auth"]["errors"];
type AuthResult = Promise<{ error: unknown }>;

const SIGN_OUT = "sign-out";
const REVOKE_OTHERS = "revoke-others";

function SessionItem({
  busy,
  current,
  messages,
  onRevoke,
  session,
}: {
  busy: boolean;
  current: boolean;
  messages: SessionsMessages;
  onRevoke?: (token: string) => void;
  session: ActiveSession;
}) {
  const revoke = useCallback(
    () => onRevoke?.(session.token),
    [onRevoke, session.token]
  );
  const Icon = session.mobile ? SmartphoneIcon : MonitorIcon;

  return (
    <li className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">{session.device}</span>
          {current ? (
            <Badge variant="success-light">{messages.current}</Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {session.details.join(" · ")}
        </p>
      </div>
      {onRevoke ? (
        <Button disabled={busy} onClick={revoke} size="sm" variant="outline">
          {busy ? messages.revoking : messages.revoke}
        </Button>
      ) : null}
    </li>
  );
}

export function ActiveSessions({
  current,
  errors,
  messages,
  others,
}: {
  current: ActiveSession;
  errors: AuthErrors;
  messages: SessionsMessages;
  others: ActiveSession[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const busyKey = isPending ? pendingKey : null;

  const run = useCallback(
    (key: string, action: () => AuthResult, onSuccess: () => void) => {
      setPendingKey(key);
      setFailed(false);
      startTransition(async () => {
        const { error } = await action();
        if (error) {
          setFailed(true);
          return;
        }
        onSuccess();
      });
    },
    []
  );

  const refresh = useCallback(() => router.refresh(), [router]);
  const revoke = useCallback(
    (token: string) =>
      run(token, () => authClient.revokeSession({ token }), refresh),
    [refresh, run]
  );
  const revokeOthers = useCallback(
    () => run(REVOKE_OTHERS, () => authClient.revokeOtherSessions(), refresh),
    [refresh, run]
  );
  const signOut = useCallback(
    () =>
      run(
        SIGN_OUT,
        () => authClient.signOut(),
        () => router.push("/login?view=sign-in")
      ),
    [router, run]
  );

  return (
    <Card className="w-full gap-0 p-0">
      <CardHeader className="gap-1.5 border-b px-6 py-6">
        <CardTitle>
          <h1 className="font-semibold text-xl">{messages.title}</h1>
        </CardTitle>
        <CardDescription className="text-sm">
          {messages.description}
        </CardDescription>
        <CardAction>
          <Button
            disabled={busyKey === SIGN_OUT}
            onClick={signOut}
            variant="outline"
          >
            <LogOutIcon aria-hidden="true" data-icon="inline-start" />
            {busyKey === SIGN_OUT ? messages.signingOut : messages.signOut}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-6 py-6">
        {failed ? (
          <AuthErrorAlert message={errors.generic} title={errors.title} />
        ) : null}
        <ul>
          <SessionItem
            busy={false}
            current
            messages={messages}
            session={current}
          />
        </ul>
        <Separator />
        <section
          aria-labelledby="other-sessions-title"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium text-sm" id="other-sessions-title">
              {messages.otherTitle}
            </h2>
            {others.length > 0 ? (
              <Button
                disabled={busyKey === REVOKE_OTHERS}
                onClick={revokeOthers}
                size="sm"
                variant="destructive"
              >
                {busyKey === REVOKE_OTHERS
                  ? messages.revoking
                  : messages.revokeOthers}
              </Button>
            ) : null}
          </div>
          {others.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {others.map((session) => (
                <SessionItem
                  busy={busyKey === session.token}
                  current={false}
                  key={session.token}
                  messages={messages}
                  onRevoke={revoke}
                  session={session}
                />
              ))}
            </ul>
          ) : (
            <Empty className="border p-6 md:p-8">
              <EmptyHeader>
                <EmptyTitle>{messages.noOtherTitle}</EmptyTitle>
                <EmptyDescription>
                  {messages.noOtherDescription}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
