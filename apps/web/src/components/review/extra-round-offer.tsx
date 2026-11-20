"use client";

import type { Locale } from "@roundcut/auth/locale";
import type { ExtraRoundSize } from "@roundcut/db/extra-round";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { type client, orpc } from "@/utils/orpc";

import { ExtraRoundAgreement, type Offer } from "./extra-round-agreement";
import { ExtraRoundDeclined } from "./extra-round-declined";
import {
  ExtraRoundPayment,
  isAwaitingPayment,
  type PaymentReturn,
} from "./extra-round-payment";

type OfferMessages = Messages["review"]["extraRound"];

const CENTS_PER_UNIT = 100;
const BASIS_POINTS = 10_000;

// How often the offer is re-read after Stripe Checkout, until the webhook
// has confirmed the payment.
const PAYMENT_POLL_MS = 3000;

type OfferStatus = NonNullable<
  Awaited<ReturnType<typeof client.extraRound.getOffer>>
>["status"];

const STATUS_BADGES = {
  accepted: "success-light",
  declined: "destructive-light",
  expired: "warning-light",
  proposed: "warning-light",
} as const satisfies Record<OfferStatus, string>;

const statusBadge = (messages: OfferMessages, status: OfferStatus) => {
  if (status === "accepted") {
    return messages.acceptedBadge;
  }
  return status === "declined" ? messages.declinedBadge : messages.badge;
};

const toPaymentReturn = (value: string | null): PaymentReturn =>
  value === "success" || value === "cancelled" ? value : null;

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

type Amounts = Pick<Offer, "grossCents" | "netCents" | "vatCents">;

const formatCents = (money: Intl.NumberFormat, cents: number) =>
  money.format(cents / CENTS_PER_UNIT);

// While proposed with a light round, the decider's pick sets the amounts
// and text they agree to (EXTRA-08); once accepted, the offer holds the
// chosen size and its amounts.
function chosenRound(offer: Offer, picked: ExtraRoundSize) {
  const choice = offer.status === "proposed" ? offer.light : null;
  if (!choice) {
    return { amounts: offer, choice, size: offer.size ?? "full" } as const;
  }
  return {
    amounts: picked === "light" ? choice : offer,
    choice,
    size: picked,
  } as const;
}

// The light or full round the decider picks when the terms price both
// (EXTRA-08), each with its total including VAT.
function SizeChoice({
  light,
  messages,
  money,
  offer,
  onChange,
  size,
}: {
  light: Amounts;
  messages: OfferMessages["size"];
  money: Intl.NumberFormat;
  offer: Amounts;
  onChange: (size: ExtraRoundSize) => void;
  size: ExtraRoundSize;
}) {
  const name = useId();
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange(event.target.value === "light" ? "light" : "full"),
    [onChange]
  );
  const options = [
    { amounts: light, value: "light" },
    { amounts: offer, value: "full" },
  ] as const;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium text-sm">{messages.legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(({ amounts, value }) => (
          <label
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring"
            key={value}
          >
            <input
              checked={size === value}
              className="mt-0.5 size-4 shrink-0 accent-primary"
              name={name}
              onChange={handleChange}
              type="radio"
              value={value}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{messages[value]}</span>
                <span className="tabular-nums">
                  {formatMessage(messages.amount, {
                    gross: formatCents(money, amounts.grossCents),
                    net: formatCents(money, amounts.netCents),
                  })}
                </span>
              </span>
              <span className="text-muted-foreground text-xs">
                {messages[`${value}Description`]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The extra round offer shown to the client once the included rounds are used
// up and a new batch has started (EXTRA-01, E12): price excluding VAT, VAT,
// total, delay and the agreement text, then the decider's answer (EXTRA-02).
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
  const queryClient = useQueryClient();
  const [size, setSize] = useState<ExtraRoundSize>("full");
  const paymentReturn = toPaymentReturn(useSearchParams().get("payment"));
  const offer = useQuery(
    orpc.extraRound.getOffer.queryOptions({
      input: { token, versionId },
      meta: { inlineError: true },
      refetchInterval: (query) =>
        paymentReturn === "success" && isAwaitingPayment(query.state.data)
          ? PAYMENT_POLL_MS
          : false,
    })
  );
  // Once paid, the round may have opened: the banner and submit button
  // follow it.
  const settled = offer.data === null || Boolean(offer.data?.paidAt);
  useEffect(() => {
    if (paymentReturn === "success" && settled) {
      queryClient.invalidateQueries({ queryKey: orpc.review.round.key() });
    }
  }, [paymentReturn, queryClient, settled]);
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
  const { amounts, choice, size: chosenSize } = chosenRound(current, size);
  const money = new Intl.NumberFormat(locale, {
    currency: current.currency,
    style: "currency",
  });
  const amount = (cents: number) => formatCents(money, cents);
  const net = amount(amounts.netCents);
  const gross = amount(amounts.grossCents);
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
  const title = formatMessage(
    current.size === "light" ? messages.titleLight : messages.title,
    { round: current.round }
  );
  const description = formatMessage(messages.description, {
    workspace: workspaceName,
  });
  const vatLabel = formatMessage(messages.vat, { rate });
  const vat = amount(amounts.vatCents);
  const agreement = formatMessage(
    chosenSize === "light" ? messages.agreementLight : messages.agreement,
    {
      delay,
      gross,
      net,
      round: current.round,
      workspace: workspaceName,
    }
  );
  const payment = current.requirePayment
    ? messages.paymentRequired
    : formatMessage(messages.paymentNotRequired, { workspace: workspaceName });
  // The offer as displayed, kept in the agreement record (EXTRA-03).
  const shownLines = [
    title,
    description,
    ...(choice
      ? [
          `${messages.size.legend} ${messages.size[chosenSize]} (${
            messages.size[`${chosenSize}Description`]
          })`,
        ]
      : []),
    `${messages.net}: ${net}`,
    `${vatLabel}: ${vat}`,
    `${messages.total}: ${gross}`,
    `${messages.delay}: +${delay}`,
    agreement,
    payment,
  ];

  return (
    <section aria-label={title}>
      <Frame className="w-full" dense spacing="default" variant="default">
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <FrameTitle className="font-medium text-sm">{title}</FrameTitle>
          <Badge variant={STATUS_BADGES[current.status]}>
            {statusBadge(messages, current.status)}
          </Badge>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-3">
          <p className="text-sm">{description}</p>
          {choice ? (
            <SizeChoice
              light={choice}
              messages={messages.size}
              money={money}
              offer={current}
              onChange={setSize}
              size={size}
            />
          ) : null}
          <dl className="flex flex-col gap-1.5 text-sm">
            <AmountRow label={messages.net} value={net} />
            <AmountRow label={vatLabel} value={vat} />
            <AmountRow label={messages.total} strong value={gross} />
            <AmountRow label={messages.delay} value={`+${delay}`} />
          </dl>
        </FramePanel>
        {current.status === "declined" ? null : (
          <FrameFooter className="flex flex-col gap-1 text-muted-foreground text-xs">
            <p>{agreement}</p>
            <p>{payment}</p>
            {current.status === "proposed" ? <p>{messages.kept}</p> : null}
            <p>
              {formatMessage(messages.validUntil, {
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: "long",
                }).format(current.expiresAt),
              })}
            </p>
          </FrameFooter>
        )}
        <FramePanel className="flex flex-col gap-3">
          {current.status === "declined" ? (
            <ExtraRoundDeclined
              key={current.id}
              locale={locale}
              messages={messages.answer}
              offer={current}
              token={token}
              versionId={versionId}
              workspaceName={workspaceName}
            />
          ) : (
            <ExtraRoundAgreement
              key={current.id}
              locale={locale}
              messages={messages.answer}
              offer={current}
              shownLines={shownLines}
              size={chosenSize}
              token={token}
              versionId={versionId}
              workspaceName={workspaceName}
            />
          )}
          {current.status === "accepted" && !current.requirePayment ? (
            <Alert variant="info">
              <InfoIcon aria-hidden="true" />
              <AlertDescription>
                {formatMessage(messages.agreedNextVersion, {
                  round: current.round,
                  workspace: workspaceName,
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          {current.status === "accepted" ? (
            <ExtraRoundPayment
              gross={gross}
              locale={locale}
              messages={messages.payment}
              offer={current}
              paymentReturn={paymentReturn}
              token={token}
              versionId={versionId}
              workspaceName={workspaceName}
            />
          ) : null}
        </FramePanel>
      </Frame>
    </section>
  );
}
