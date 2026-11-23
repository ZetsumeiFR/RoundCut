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
import { Progress, ProgressLabel } from "@roundcut/ui/components/progress";
import {
  Alert,
  AlertAction,
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
  ClockAlertIcon,
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
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import {
  formatEuros,
  PricingDialog,
  type SubscriptionStatus,
} from "./pricing-dialog";
import { SettingsLoadError } from "./settings-form";

type SubscriptionMessages = Messages["account"]["subscription"];
export type CheckoutOutcome = "cancel" | "success" | null;

const DAY_MS = 86_400_000;

const formatDate = (value: Date | string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(value)
  );

// "December 7, 2026 (14 days left)": the trial's last day and what remains.
const trialEndLabel = (
  endsAt: Date | string,
  locale: Locale,
  messages: SubscriptionMessages["trial"]
) => {
  const count = Math.max(
    1,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY_MS)
  );
  const left = formatMessage(
    count === 1 ? messages.daysLeftOne : messages.daysLeftOther,
    { count }
  );
  return `${formatDate(endsAt, locale)} (${left})`;
};

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
  const { available, catalog, effectivePlan, founder, subscription, trial } =
    status;
  const badge = statusBadge(trial.active ? "trialing" : subscription.status);
  const entry = catalog.find((item) => item.plan === effectivePlan);
  const { interval, live } = subscription;
  let note = messages.summary.noSubscription;
  if (live) {
    note = messages.summary.liveNote;
  } else if (trial.active) {
    note = formatMessage(messages.trial.note, {
      plan: messages.plans[trial.plan].name,
    });
  }
  let renewal = {
    label: messages.summary.renewsAt,
    value:
      live && subscription.renewsAt
        ? formatDate(subscription.renewsAt, locale)
        : "—",
  };
  if (trial.active) {
    renewal = {
      label: messages.trial.endsAt,
      value: trialEndLabel(trial.endsAt, locale, messages.trial),
    };
  }
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
    { id: "renewal", ...renewal },
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
                <CardTitle>{messages.plans[effectivePlan].name}</CardTitle>
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
                {note}
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

// Shown once the free trial is over and no subscription took over (SUB-02).
function TrialEndedAlert({
  messages,
  onChoosePlan,
  status,
}: {
  messages: SubscriptionMessages;
  onChoosePlan: () => void;
  status: SubscriptionStatus;
}) {
  if (status.subscription.live || status.trial.active) {
    return null;
  }
  return (
    <Alert variant="warning">
      <ClockAlertIcon aria-hidden="true" />
      <AlertTitle>{messages.trial.endedTitle}</AlertTitle>
      <AlertDescription>{messages.trial.endedDescription}</AlertDescription>
      {status.available ? (
        <AlertAction>
          <Button onClick={onChoosePlan} size="sm" type="button">
            {messages.pricing.open}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

// The usage gauges (SUB-02): active projects and storage against the limits
// of the plan in effect, next to the size limit per file.
function UsageCard({
  locale,
  messages,
  status,
}: {
  locale: Locale;
  messages: SubscriptionMessages["limits"];
  status: SubscriptionStatus;
}) {
  const limits = status.catalog.find(
    (entry) => entry.plan === status.effectivePlan
  )?.limits;
  if (!limits) {
    return null;
  }
  const { usage } = status;
  const percent = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  });
  const metrics = [
    {
      caption:
        limits.activeProjects === null
          ? messages.unlimited
          : formatMessage(messages.of, { limit: limits.activeProjects }),
      description: messages.activeProjectsDescription,
      icon: FolderKanbanIcon,
      id: "projects",
      ratio:
        limits.activeProjects === null
          ? null
          : usage.activeProjects / limits.activeProjects,
      title: messages.activeProjects,
      value: String(usage.activeProjects),
    },
    {
      caption: formatMessage(messages.of, {
        limit: formatBytes(limits.storageBytes, locale),
      }),
      description: messages.storageDescription,
      icon: HardDriveIcon,
      id: "storage",
      ratio: usage.storageBytes / limits.storageBytes,
      title: messages.storage,
      value: formatBytes(usage.storageBytes, locale),
    },
    {
      caption: null,
      description: messages.fileSizeDescription,
      icon: FileVideoIcon,
      id: "file",
      ratio: null,
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
              <div className="flex flex-col gap-2">
                <p className="font-semibold text-lg tabular-nums tracking-tight">
                  {metric.value}{" "}
                  {metric.caption ? (
                    <span className="font-normal text-muted-foreground text-sm">
                      {metric.caption}
                    </span>
                  ) : null}
                </p>
                {metric.ratio === null ? null : (
                  <Progress
                    aria-label={metric.title}
                    value={Math.min(metric.ratio, 1) * 100}
                  >
                    <ProgressLabel className="text-muted-foreground">
                      {formatMessage(messages.usage, {
                        percent: percent.format(metric.ratio),
                      })}
                    </ProgressLabel>
                  </Progress>
                )}
              </div>
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
        <TrialEndedAlert
          messages={messages}
          onChoosePlan={handleChoosePlan}
          status={data}
        />
        <PlanSummaryCard
          locale={locale}
          messages={messages}
          onChoosePlan={handleChoosePlan}
          status={data}
        />
        <UsageCard locale={locale} messages={messages.limits} status={data} />
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
