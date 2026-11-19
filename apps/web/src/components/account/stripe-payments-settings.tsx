"use client";

import { Button, buttonVariants } from "@roundcut/ui/components/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { client as api, orpc } from "@/utils/orpc";
import type { TermsMessages } from "./revision-terms-settings";
import { SettingsCard } from "./settings-card";

type PaymentsMessages = TermsMessages["payments"];

const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";

function ConnectButton({
  label,
  messages,
}: {
  label: string;
  messages: PaymentsMessages;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const handleConnect = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { url } = await api.payments.connect();
      window.location.assign(url);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }, []);
  const buttonLabel = busy ? messages.connecting : label;
  return (
    <div className="flex flex-col items-start gap-2">
      {failed ? (
        <Alert role="alert" variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{messages.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={busy} onClick={handleConnect} size="sm" type="button">
        {buttonLabel}
      </Button>
    </div>
  );
}

// The editor's Stripe account for extra round payments (EXTRA-04): locked on
// Solo, then connect, finish the Stripe onboarding, or active.
export function StripePaymentsSettings({
  messages,
}: {
  messages: PaymentsMessages;
}) {
  const { data, isError, refetch } = useQuery(
    orpc.payments.status.queryOptions({ meta: { inlineError: true } })
  );
  const handleRetry = useCallback(() => refetch(), [refetch]);

  let body: ReactNode;
  if (isError) {
    body = (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{messages.loadError}</span>
          <Button
            onClick={handleRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            {messages.retry}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!data) {
    body = (
      <Skeleton
        aria-label={messages.title}
        className="h-16 w-full"
        role="status"
      />
    );
  } else if (data.locked) {
    body = (
      <Alert variant="info">
        <LockIcon aria-hidden="true" />
        <AlertTitle className="line-clamp-none">{messages.locked}</AlertTitle>
        <AlertDescription>{messages.lockedDescription}</AlertDescription>
      </Alert>
    );
  } else if (!data.available) {
    body = (
      <p className="text-muted-foreground text-sm">{messages.unavailable}</p>
    );
  } else if (data.accountId === null) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm">{messages.connectDescription}</p>
        <ConnectButton label={messages.connect} messages={messages} />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{messages.account}</span>
          <span className="font-mono">{data.accountId}</span>
          {data.active ? (
            <Badge variant="success-light">{messages.active}</Badge>
          ) : (
            <Badge variant="warning-light">{messages.pending}</Badge>
          )}
        </div>
        <p className="text-sm">
          {data.active
            ? messages.activeDescription
            : messages.pendingDescription}
        </p>
        {data.active ? (
          <a
            className={buttonVariants({
              className: "self-start",
              size: "sm",
              variant: "outline",
            })}
            href={STRIPE_DASHBOARD_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {messages.dashboard}
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        ) : (
          <ConnectButton label={messages.finish} messages={messages} />
        )}
      </div>
    );
  }

  return (
    <SettingsCard description={messages.description} title={messages.title}>
      <div className="px-5 py-4">{body}</div>
    </SettingsCard>
  );
}
