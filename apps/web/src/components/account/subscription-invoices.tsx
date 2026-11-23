"use client";

import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { Card, CardContent } from "@roundcut/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Badge, type BadgeProps } from "@roundcut/ui/components/reui/badge";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ReceiptTextIcon,
} from "lucide-react";
import { type ReactNode, useCallback } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { type client as api, orpc } from "@/utils/orpc";

type InvoicesMessages = Messages["account"]["subscription"]["invoices"];
type Invoice = Awaited<ReturnType<typeof api.subscription.invoices>>[number];

const CENTS_PER_UNIT = 100;
const SKELETON_ROWS = ["first", "second", "third"];

const statusBadge = (
  status: string | null
): {
  key: keyof InvoicesMessages["statuses"];
  variant: BadgeProps["variant"];
} | null => {
  switch (status) {
    case "paid":
      return { key: "paid", variant: "success-light" };
    case "open":
      return { key: "open", variant: "warning-light" };
    case "uncollectible":
      return { key: "uncollectible", variant: "destructive-light" };
    case "void":
    case "draft":
      return { key: status, variant: "outline" };
    default:
      return null;
  }
};

function InvoiceRow({
  invoice,
  locale,
  messages,
}: {
  invoice: Invoice;
  locale: Locale;
  messages: InvoicesMessages;
}) {
  const badge = statusBadge(invoice.status);
  const number = invoice.number ?? "—";
  const amount = new Intl.NumberFormat(locale, {
    currency: invoice.currency,
    style: "currency",
  }).format(invoice.amountCents / CENTS_PER_UNIT);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="truncate font-medium text-sm">{number}</span>
        <span className="text-muted-foreground text-sm">
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
            new Date(invoice.createdAt)
          )}
        </span>
      </div>
      <span className="font-medium text-sm tabular-nums">{amount}</span>
      {badge ? (
        <Badge size="sm" variant={badge.variant}>
          {messages.statuses[badge.key]}
        </Badge>
      ) : null}
      <div className="flex shrink-0 gap-1">
        {invoice.hostedUrl ? (
          <Button
            aria-label={formatMessage(messages.viewLabel, { number })}
            nativeButton={false}
            render={
              <a href={invoice.hostedUrl} rel="noopener" target="_blank" />
            }
            size="sm"
            variant="ghost"
          >
            <ExternalLinkIcon aria-hidden="true" />
            {messages.view}
          </Button>
        ) : null}
        {invoice.pdfUrl ? (
          <Button
            aria-label={formatMessage(messages.downloadLabel, { number })}
            nativeButton={false}
            render={<a href={invoice.pdfUrl} rel="noopener" target="_blank" />}
            size="sm"
            variant="ghost"
          >
            <DownloadIcon aria-hidden="true" />
            {messages.download}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

// Invoice history of the E17 screen (SUB-03, @reui/profile-8): the last
// Stripe invoices with their status, hosted page and PDF.
export function SubscriptionInvoices({
  locale,
  messages,
  retryLabel,
}: {
  locale: Locale;
  messages: InvoicesMessages;
  retryLabel: string;
}) {
  const { data, isError, refetch } = useQuery(
    orpc.subscription.invoices.queryOptions({ meta: { inlineError: true } })
  );
  const handleRetry = useCallback(() => refetch(), [refetch]);

  let body: ReactNode;
  if (isError) {
    body = (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>{messages.loadError}</AlertTitle>
        <AlertDescription className="sr-only">
          {messages.loadError}
        </AlertDescription>
        <AlertAction>
          <Button onClick={handleRetry} size="sm" variant="outline">
            {retryLabel}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!data) {
    body = (
      <Card className="gap-0 p-0" role="status">
        <CardContent className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          {SKELETON_ROWS.map((row) => (
            <Skeleton className="h-10 w-full" key={row} />
          ))}
        </CardContent>
      </Card>
    );
  } else if (data.length === 0) {
    body = (
      <Card className="gap-0 p-0">
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{messages.empty}</EmptyTitle>
            <EmptyDescription>{messages.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  } else {
    body = (
      <Card className="gap-0 p-0">
        <ul aria-label={messages.title} className="divide-y">
          {data.map((invoice) => (
            <InvoiceRow
              invoice={invoice}
              key={invoice.id}
              locale={locale}
              messages={messages}
            />
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <section aria-label={messages.title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-px px-1">
        <h2 className="font-semibold text-base">{messages.title}</h2>
        <p className="text-muted-foreground text-sm">{messages.description}</p>
      </div>
      {body}
    </section>
  );
}
