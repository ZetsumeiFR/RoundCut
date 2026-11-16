"use client";

import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  Frame,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@roundcut/ui/components/reui/frame";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { cn } from "@roundcut/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { orpc } from "@/utils/orpc";

type OfferMessages = Messages["review"]["extraRound"];

const CENTS_PER_UNIT = 100;
const BASIS_POINTS = 10_000;

function AmountRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong && "font-semibold")}>
        {value}
      </dd>
    </div>
  );
}

// The extra round offer shown to the client once the included rounds are used
// up and a new batch has started (EXTRA-01, E12): price excluding VAT, VAT,
// total, delay and the agreement text. Accepting it comes with EXTRA-02.
export function ExtraRoundOffer({
  locale,
  messages,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: OfferMessages;
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const offer = useQuery(
    orpc.extraRound.getOffer.queryOptions({
      input: { token, versionId },
      meta: { inlineError: true },
    })
  );
  const { refetch } = offer;
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (offer.isError) {
    return (
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
  }
  if (offer.data === undefined) {
    return (
      <Skeleton
        aria-label={messages.loading}
        className="h-48 w-full"
        role="status"
      />
    );
  }
  if (offer.data === null) {
    return null;
  }

  const current = offer.data;
  const money = new Intl.NumberFormat(locale, {
    currency: current.currency,
    style: "currency",
  });
  const amount = (cents: number) => money.format(cents / CENTS_PER_UNIT);
  const net = amount(current.netCents);
  const gross = amount(current.grossCents);
  const delay = formatMessage(
    new Intl.PluralRules(locale).select(current.delayDays) === "one"
      ? messages.delayOne
      : messages.delayOther,
    { count: current.delayDays }
  );
  const rate = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    style: "percent",
  }).format(current.vatRateBps / BASIS_POINTS);
  const title = formatMessage(messages.title, { round: current.round });

  return (
    <section aria-label={title}>
      <Frame className="w-full" dense spacing="default" variant="default">
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <FrameTitle className="font-medium text-sm">{title}</FrameTitle>
          <Badge variant="warning-light">{messages.badge}</Badge>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-3">
          <p className="text-sm">
            {formatMessage(messages.description, { workspace: workspaceName })}
          </p>
          <dl className="flex flex-col gap-1.5 text-sm">
            <AmountRow label={messages.net} value={net} />
            <AmountRow
              label={formatMessage(messages.vat, { rate })}
              value={amount(current.vatCents)}
            />
            <AmountRow label={messages.total} strong value={gross} />
            <AmountRow label={messages.delay} value={`+${delay}`} />
          </dl>
        </FramePanel>
        <FrameFooter className="flex flex-col gap-1 text-muted-foreground text-xs">
          <p>
            {formatMessage(messages.agreement, {
              delay,
              gross,
              net,
              round: current.round,
              workspace: workspaceName,
            })}
          </p>
          <p>
            {current.requirePayment
              ? messages.paymentRequired
              : formatMessage(messages.paymentNotRequired, {
                  workspace: workspaceName,
                })}
          </p>
          <p>{messages.kept}</p>
          <p>
            {formatMessage(messages.validUntil, {
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: "long",
              }).format(current.expiresAt),
            })}
          </p>
        </FrameFooter>
      </Frame>
    </section>
  );
}
