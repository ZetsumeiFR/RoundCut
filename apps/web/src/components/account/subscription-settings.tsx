"use client";

import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@roundcut/ui/components/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Badge, type BadgeProps } from "@roundcut/ui/components/reui/badge";
import { IconTile } from "@roundcut/ui/components/reui/icon-tile";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  CircleXIcon,
  CreditCardIcon,
  FileVideoIcon,
  FolderKanbanIcon,
  HardDriveIcon,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { formatBytes } from "@/components/projects/version-upload-sheet";
import type { Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import {
  formatEuros,
  PricingDialog,
  type SubscriptionStatus,
} from "./pricing-dialog";
import { SettingsLoadError } from "./settings-form";

type SubscriptionMessages = Messages["account"]["subscription"];
export type CheckoutOutcome = "cancel" | "success" | null;

const statusBadge = (
  status: string | null
): {
  key: keyof SubscriptionMessages["statuses"];
  variant: BadgeProps["variant"];
} => {
  switch (status) {
    case "active":
    case "trialing":
      return { key: status, variant: "success-light" };
    case "past_due":
    case "incomplete":
    case "unpaid":
      return { key: status, variant: "warning-light" };
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return { key: status, variant: "destructive-light" };
    default:
      return { key: "none", variant: "outline" };
  }
};

function PlanSummaryCard({
  locale,
  messages,
  onChoosePlan,
  status,
}: {
  locale: Locale;
  messages: SubscriptionMessages;
  onChoosePlan: () => void;
  status: SubscriptionStatus;
}) {
  const { available, catalog, founder, subscription } = status;
  const badge = statusBadge(subscription.status);
  const entry = catalog.find((item) => item.plan === subscription.plan);
  const { interval, live } = subscription;
  let price: ReactNode = null;
  if (live && entry && interval) {
    const cents = subscription.founder
      ? founder.priceCents
      : entry.prices[interval];
    price = (
      <p className="text-sm">
        <span className="font-medium">{formatEuros(cents, locale)}</span>{" "}
        <span className="text-muted-foreground">
          {interval === "year"
            ? messages.summary.perYear
            : messages.summary.perMonth}
        </span>
      </p>
    );
  }
  const facts = [
    {
      id: "billing",
      label: messages.summary.billing,
      value: interval ? messages.summary[interval] : "—",
    },
    {
      id: "renewal",
      label: messages.summary.renewsAt,
      value:
        live && subscription.renewsAt
          ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
              new Date(subscription.renewsAt)
            )
          : "—",
    },
    {
      id: "seats",
      label: messages.summary.seats,
      value: String(entry?.limits.seats ?? 1),
    },
  ];
  let action: ReactNode = (
    <Button onClick={onChoosePlan} size="sm" type="button" variant="outline">
      {messages.pricing.open}
    </Button>
  );
  if (!available) {
    action = (
      <p className="text-muted-foreground text-sm">{messages.unavailable}</p>
    );
  } else if (live) {
    action = null;
  }

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="gap-6 px-5 py-5 sm:px-6">
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(10rem,13rem)]">
          <div className="flex min-w-0 gap-4">
            <IconTile variant="elevated">
              <CreditCardIcon aria-hidden="true" />
            </IconTile>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{messages.plans[subscription.plan].name}</CardTitle>
                <Badge size="sm" variant={badge.variant}>
                  {messages.statuses[badge.key]}
                </Badge>
                {subscription.founder ? (
                  <Badge size="sm" variant="primary-light">
                    {messages.summary.founder}
                  </Badge>
                ) : null}
              </div>
              {price}
              <p className="max-w-xl text-muted-foreground text-sm leading-6">
                {live
                  ? messages.summary.liveNote
                  : messages.summary.noSubscription}
              </p>
            </div>
          </div>
          <dl className="grid gap-4 md:pl-4">
            {facts.map((fact) => (
              <div className="flex flex-col gap-0.5" key={fact.id}>
                <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {fact.label}
                </dt>
                <dd className="font-medium text-sm">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardHeader>
      {action ? (
        <CardFooter className="justify-end border-t px-5 py-3 sm:px-6">
          {action}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function LimitsCard({
  locale,
  messages,
  status,
}: {
  locale: Locale;
  messages: SubscriptionMessages["limits"];
  status: SubscriptionStatus;
}) {
  const limits = status.catalog.find(
    (entry) => entry.plan === status.subscription.plan
  )?.limits;
  if (!limits) {
    return null;
  }
  const metrics = [
    {
      description: messages.activeProjectsDescription,
      icon: FolderKanbanIcon,
      id: "projects",
      title: messages.activeProjects,
      value:
        limits.activeProjects === null
          ? messages.unlimited
          : String(limits.activeProjects),
    },
    {
      description: messages.storageDescription,
      icon: HardDriveIcon,
      id: "storage",
      title: messages.storage,
      value: formatBytes(limits.storageBytes, locale),
    },
    {
      description: messages.fileSizeDescription,
      icon: FileVideoIcon,
      id: "file",
      title: messages.fileSize,
      value: formatBytes(limits.maxFileBytes, locale),
    },
  ];
  return (
    <section aria-label={messages.title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-px px-1">
        <h2 className="font-semibold text-base">{messages.title}</h2>
        <p className="text-muted-foreground text-sm">{messages.description}</p>
      </div>
      <Card className="gap-0 p-0">
        <CardContent className="grid gap-0 divide-y p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {metrics.map(({ icon: Icon, ...metric }) => (
            <div
              className="flex flex-col justify-between gap-4 px-5 py-5 sm:px-6"
              key={metric.id}
            >
              <div className="flex items-center gap-3">
                <IconTile size="sm" variant="elevated">
                  <Icon aria-hidden="true" />
                </IconTile>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{metric.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {metric.description}
                  </p>
                </div>
              </div>
              <p className="font-semibold text-lg tabular-nums tracking-tight">
                {metric.value}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function CheckoutAlert({
  messages,
  outcome,
}: {
  messages: SubscriptionMessages["checkout"];
  outcome: CheckoutOutcome;
}) {
  if (outcome === "success") {
    return (
      <Alert variant="success">
        <CircleCheckIcon aria-hidden="true" />
        <AlertTitle>{messages.successTitle}</AlertTitle>
        <AlertDescription>{messages.successDescription}</AlertDescription>
      </Alert>
    );
  }
  if (outcome === "cancel") {
    return (
      <Alert variant="info">
        <CircleXIcon aria-hidden="true" />
        <AlertTitle>{messages.cancelTitle}</AlertTitle>
        <AlertDescription>{messages.cancelDescription}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

// E17 subscription screen (base @reui/profile-8): the plan summary, its
// limits and the pricing dialog. Back from Checkout, the subscription is
// read from Stripe once in case its webhook hasn't arrived yet.
export function SubscriptionSettings({
  checkout,
  locale,
  messages,
}: {
  checkout: CheckoutOutcome;
  locale: Locale;
  messages: SubscriptionMessages;
}) {
  const queryClient = useQueryClient();
  const { data, isError, refetch } = useQuery(
    orpc.subscription.status.queryOptions({ meta: { inlineError: true } })
  );
  const [pricingOpen, setPricingOpen] = useState(false);
  const refreshed = useRef<boolean>(false);
  const handleRetry = useCallback(() => refetch(), [refetch]);
  const handleChoosePlan = useCallback(() => setPricingOpen(true), []);

  useEffect(() => {
    if (checkout !== "success" || refreshed.current) {
      return;
    }
    refreshed.current = true;
    const refresh = async () => {
      try {
        await api.subscription.refresh();
      } finally {
        await queryClient.invalidateQueries({
          queryKey: orpc.subscription.status.queryKey(),
        });
      }
    };
    refresh();
  }, [checkout, queryClient]);

  let body: ReactNode;
  if (isError) {
    body = <SettingsLoadError messages={messages} onRetry={handleRetry} />;
  } else if (data) {
    body = (
      <>
        <PlanSummaryCard
          locale={locale}
          messages={messages}
          onChoosePlan={handleChoosePlan}
          status={data}
        />
        <LimitsCard locale={locale} messages={messages.limits} status={data} />
        <PricingDialog
          locale={locale}
          messages={messages}
          onOpenChange={setPricingOpen}
          open={pricingOpen}
          status={data}
        />
      </>
    );
  } else {
    body = (
      <div
        aria-label={messages.title}
        className="flex flex-col gap-4"
        role="status"
      >
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-px px-1">
        <h2 className="font-semibold text-base">{messages.title}</h2>
        <p className="text-muted-foreground text-sm">{messages.description}</p>
      </div>
      <CheckoutAlert messages={messages.checkout} outcome={checkout} />
      {body}
    </div>
  );
}
