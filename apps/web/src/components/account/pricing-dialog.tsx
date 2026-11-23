"use client";

import type { Locale } from "@roundcut/auth/locale";
import { type BillingInterval, PLANS, type Plan } from "@roundcut/db/plan";
import { Button } from "@roundcut/ui/components/button";
import { Checkbox } from "@roundcut/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@roundcut/ui/components/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@roundcut/ui/components/item";
import { Label } from "@roundcut/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@roundcut/ui/components/radio-group";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { IconTile } from "@roundcut/ui/components/reui/icon-tile";
import { ScrollArea } from "@roundcut/ui/components/scroll-area";
import { Separator } from "@roundcut/ui/components/separator";
import { Tabs, TabsList, TabsTrigger } from "@roundcut/ui/components/tabs";
import { cn } from "@roundcut/ui/lib/utils";
import {
  BriefcaseIcon,
  Building2Icon,
  CheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useId, useState } from "react";

import { formatBytes } from "@/components/projects/version-upload-sheet";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api } from "@/utils/orpc";

export type SubscriptionStatus = Awaited<
  ReturnType<typeof api.subscription.status>
>;
type SubscriptionMessages = Messages["account"]["subscription"];
type PricingMessages = SubscriptionMessages["pricing"];
type CatalogEntry = SubscriptionStatus["catalog"][number];

const RECOMMENDED_PLAN: Plan = "pro";
const MONTHS_PER_YEAR = 12;
const CENTS_PER_EURO = 100;

const PLAN_ICONS = {
  pro: BriefcaseIcon,
  solo: UserIcon,
  studio: Building2Icon,
} as const;

export const formatEuros = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(locale, {
    currency: "EUR",
    minimumFractionDigits: cents % CENTS_PER_EURO ? 2 : 0,
    style: "currency",
  }).format(cents / CENTS_PER_EURO);

const monthlyCents = (entry: CatalogEntry, interval: BillingInterval) =>
  interval === "year"
    ? Math.round(entry.prices.year / MONTHS_PER_YEAR)
    : entry.prices.month;

interface Feature {
  id: string;
  included: boolean;
  label: string;
}

function planFeatures(
  entry: CatalogEntry,
  locale: Locale,
  messages: PricingMessages["features"]
): Feature[] {
  const { limits, plan } = entry;
  const paid = plan !== "solo";
  const seats = new Intl.PluralRules(locale).select(limits.seats);
  return [
    {
      id: "projects",
      included: true,
      label:
        limits.activeProjects === null
          ? messages.unlimitedProjects
          : formatMessage(messages.activeProjects, {
              count: limits.activeProjects,
            }),
    },
    {
      id: "file",
      included: true,
      label: formatMessage(messages.fileSize, {
        size: formatBytes(limits.maxFileBytes, locale),
      }),
    },
    {
      id: "storage",
      included: true,
      label: formatMessage(messages.storage, {
        size: formatBytes(limits.storageBytes, locale),
      }),
    },
    {
      id: "seats",
      included: true,
      label: formatMessage(
        seats === "one" ? messages.seatOne : messages.seatOther,
        { count: limits.seats }
      ),
    },
    { id: "whiteLabel", included: paid, label: messages.whiteLabel },
    { id: "roundPayments", included: paid, label: messages.roundPayments },
    { id: "export", included: paid, label: messages.export },
  ];
}

function PlanRail({
  catalog,
  interval,
  locale,
  messages,
  onPlanChange,
  plan,
}: {
  catalog: CatalogEntry[];
  interval: BillingInterval;
  locale: Locale;
  messages: SubscriptionMessages;
  onPlanChange: (plan: Plan) => void;
  plan: Plan;
}) {
  const labelId = useId();
  const handleChange = useCallback(
    (value: unknown) => {
      const next = PLANS.find((item) => item === value);
      if (next) {
        onPlanChange(next);
      }
    },
    [onPlanChange]
  );
  return (
    <div className="flex flex-col gap-3 border-b px-5 py-4 md:border-r md:border-b-0">
      <p className="font-medium text-sm" id={labelId}>
        {messages.pricing.railLabel}
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        className="flex flex-col gap-2"
        onValueChange={handleChange}
        value={plan}
      >
        {catalog.map((entry) => {
          const Icon = PLAN_ICONS[entry.plan];
          return (
            <Item
              className={cn(
                "relative cursor-pointer flex-nowrap transition-colors has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                entry.plan === plan ? "bg-muted" : "hover:bg-muted/60"
              )}
              key={entry.plan}
              render={<Label />}
              size="sm"
              variant="outline"
            >
              <RadioGroupItem className="sr-only absolute" value={entry.plan} />
              <ItemMedia className="self-center!">
                <IconTile variant="elevated">
                  <Icon aria-hidden="true" />
                </IconTile>
              </ItemMedia>
              <ItemContent className="min-w-0 gap-0.5">
                <ItemTitle>{messages.plans[entry.plan].name}</ItemTitle>
                <ItemDescription className="truncate text-xs">
                  {messages.plans[entry.plan].audience}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="font-medium text-foreground tabular-nums">
                {formatEuros(monthlyCents(entry, interval), locale)}
                <span className="sr-only"> {messages.pricing.perMonth}</span>
              </ItemActions>
            </Item>
          );
        })}
      </RadioGroup>
    </div>
  );
}

function IntervalTabs({
  interval,
  messages,
  onIntervalChange,
}: {
  interval: BillingInterval;
  messages: PricingMessages;
  onIntervalChange: (interval: BillingInterval) => void;
}) {
  const handleChange = useCallback(
    (value: unknown) => {
      if (value === "month" || value === "year") {
        onIntervalChange(value);
      }
    },
    [onIntervalChange]
  );
  return (
    <Tabs onValueChange={handleChange} value={interval}>
      <TabsList activateOnFocus aria-label={messages.billingLabel}>
        <TabsTrigger value="month">{messages.month}</TabsTrigger>
        <TabsTrigger value="year">
          {messages.year}{" "}
          <Badge className="-mr-1" variant="success-light">
            {messages.yearBadge}
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function PlanDetail({
  entry,
  interval,
  locale,
  messages,
  previous,
}: {
  entry: CatalogEntry;
  interval: BillingInterval;
  locale: Locale;
  messages: SubscriptionMessages;
  previous: Plan | null;
}) {
  const recommended = entry.plan === RECOMMENDED_PLAN;
  const saving = entry.prices.month * MONTHS_PER_YEAR - entry.prices.year;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-lg">
            {messages.plans[entry.plan].name}
            {recommended ? (
              <span className="sr-only">, {messages.pricing.recommended}</span>
            ) : null}
          </h3>
          {recommended ? (
            <Badge aria-hidden="true" variant="outline">
              {messages.pricing.recommended}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-4xl tabular-nums tracking-tight">
              {formatEuros(monthlyCents(entry, interval), locale)}
            </span>
            <span className="text-muted-foreground">
              {messages.pricing.perMonth}
            </span>
          </p>
          <p className="text-muted-foreground tabular-nums">
            {formatMessage(messages.pricing.saving, {
              amount: formatEuros(saving, locale),
            })}
          </p>
        </div>
      </div>
      <Separator aria-hidden="true" />
      <div className="flex flex-col gap-3">
        <p className="font-medium">
          {previous
            ? formatMessage(messages.pricing.includesPrevious, {
                plan: messages.plans[previous].name,
              })
            : messages.pricing.includes}
        </p>
        <ul className="flex flex-col gap-3">
          {planFeatures(entry, locale, messages.pricing.features).map(
            (feature) => (
              <li className="flex items-start gap-2" key={feature.id}>
                <span className="flex h-5 shrink-0 items-center">
                  {feature.included ? (
                    <CheckIcon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  ) : (
                    <XIcon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  )}
                </span>
                <span className="min-w-0 text-muted-foreground">
                  {feature.included ? null : (
                    <span className="sr-only">
                      {messages.pricing.notIncluded}:{" "}
                    </span>
                  )}
                  {feature.label}
                </span>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}

function FounderOffer({
  checked,
  founder,
  locale,
  messages,
  onCheckedChange,
  regularCents,
}: {
  checked: boolean;
  founder: SubscriptionStatus["founder"];
  locale: Locale;
  messages: PricingMessages["founder"];
  onCheckedChange: (checked: boolean) => void;
  regularCents: number;
}) {
  const id = useId();
  const soldOut = founder.seatsLeft === 0;
  const handleChange = useCallback(
    (value: boolean) => onCheckedChange(value),
    [onCheckedChange]
  );
  return (
    <Alert variant={soldOut ? "warning" : "info"}>
      <SparklesIcon aria-hidden="true" />
      <AlertTitle className="line-clamp-none">{messages.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>
          {formatMessage(messages.description, {
            price: formatEuros(founder.priceCents, locale),
            regular: formatEuros(regularCents, locale),
          })}
        </span>
        {soldOut ? (
          <span>{messages.soldOut}</span>
        ) : (
          <>
            {founder.seatsLeft === null ? null : (
              <span className="font-medium tabular-nums">
                {formatMessage(messages.left, {
                  left: founder.seatsLeft,
                  seats: founder.seats,
                })}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Checkbox
                checked={checked}
                id={id}
                onCheckedChange={handleChange}
              />
              <Label htmlFor={id}>{messages.use}</Label>
            </span>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

// E17 pricing dialog (base @reui/pricing-7): a rail of plans beside the
// chosen plan's price and features, over a footer naming the bill and
// opening Stripe Checkout. The Founder offer shows on Pro billed yearly.
export function PricingDialog({
  locale,
  messages,
  onOpenChange,
  open,
  status,
}: {
  locale: Locale;
  messages: SubscriptionMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  status: SubscriptionStatus;
}) {
  const { catalog, founder, subscription } = status;
  const [interval, setBillingInterval] = useState<BillingInterval>("year");
  const [plan, setPlan] = useState<Plan>(RECOMMENDED_PLAN);
  const [useFounder, setUseFounder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const index = catalog.findIndex((item) => item.plan === plan);
  const entry = catalog[index] ?? catalog[0];
  const previous = index > 0 ? (catalog[index - 1]?.plan ?? null) : null;
  const founderChoice = plan === founder.plan && interval === founder.interval;
  const withFounder = founderChoice && useFounder && founder.seatsLeft !== 0;
  const isCurrent = subscription.live && subscription.plan === plan;
  const bill = withFounder ? founder.priceCents : entry?.prices[interval];

  const handleSubscribe = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { url } = await api.subscription.checkoutUrl({
        founder: withFounder,
        interval,
        plan,
      });
      window.location.assign(url);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }, [interval, plan, withFounder]);

  if (!entry || bill === undefined) {
    return null;
  }
  const planName = messages.plans[plan].name;
  const subscribeLabel = busy
    ? messages.pricing.subscribing
    : formatMessage(messages.pricing.subscribe, { plan: planName });
  const buttonLabel = isCurrent ? messages.pricing.current : subscribeLabel;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(90svh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg md:max-w-[min(56rem,calc(100%-2rem))]">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="font-semibold text-lg">
            {messages.pricing.title}
          </DialogTitle>
          <DialogDescription>{messages.pricing.description}</DialogDescription>
        </DialogHeader>
        {/* A grid cell hands the ScrollArea a definite height under the cap. */}
        <div className="grid min-h-0 flex-1">
          <ScrollArea className="min-h-0">
            <div className="flex flex-col md:grid md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
              <PlanRail
                catalog={catalog}
                interval={interval}
                locale={locale}
                messages={messages}
                onPlanChange={setPlan}
                plan={plan}
              />
              <div className="flex min-w-0 flex-col gap-5 px-5 py-4">
                <IntervalTabs
                  interval={interval}
                  messages={messages.pricing}
                  onIntervalChange={setBillingInterval}
                />
                <PlanDetail
                  entry={entry}
                  interval={interval}
                  locale={locale}
                  messages={messages}
                  previous={previous}
                />
                {founderChoice && !subscription.live ? (
                  <FounderOffer
                    checked={useFounder}
                    founder={founder}
                    locale={locale}
                    messages={messages.pricing.founder}
                    onCheckedChange={setUseFounder}
                    regularCents={entry.prices.year}
                  />
                ) : null}
              </div>
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="m-0 shrink-0 flex-col gap-3 border-t px-5 py-4 sm:items-center sm:justify-between">
          {failed ? (
            <Alert className="w-full" role="alert" variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>{messages.pricing.error}</AlertDescription>
            </Alert>
          ) : null}
          <p
            className="flex min-w-0 items-center gap-2 text-muted-foreground"
            role="status"
          >
            <span className="shrink-0 font-medium text-foreground">
              {planName}
            </span>
            <span
              aria-hidden="true"
              className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
            />
            <span className="min-w-0 truncate tabular-nums">
              {formatEuros(bill, locale)}{" "}
              {interval === "year"
                ? messages.pricing.billedYearly
                : messages.pricing.billedMonthly}
            </span>
          </p>
          <Button
            className="w-full shrink-0 sm:w-auto"
            disabled={busy || isCurrent || subscription.live}
            onClick={handleSubscribe}
            type="button"
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
