"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  CreditCardIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type PaymentMessages = Messages["review"]["extraRound"]["payment"];
type Offer = NonNullable<Awaited<ReturnType<typeof api.extraRound.getOffer>>>;

export type PaymentReturn = "success" | "cancelled" | null;

export const isAwaitingPayment = (offer: Offer | null | undefined) =>
  offer?.status === "accepted" && offer.requirePayment && !offer.paidAt;

function errorMessage(
  error: unknown,
  messages: PaymentMessages,
  workspaceName: string
) {
  if (error instanceof ORPCError && error.code === "PRECONDITION_FAILED") {
    return formatMessage(messages.unavailable, { workspace: workspaceName });
  }
  return messages.error;
}

// Payment of an accepted extra round that asks for it (EXTRA-04, E12): the
// decider is sent to Stripe Checkout on the editor's account; the round opens
// when Stripe confirms the payment, not when the client comes back.
export function ExtraRoundPayment({
  gross,
  locale,
  messages,
  offer,
  paymentReturn,
  token,
  versionId,
  workspaceName,
}: {
  gross: string;
  locale: Locale;
  messages: PaymentMessages;
  offer: Offer;
  paymentReturn: PaymentReturn;
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.extraRound.checkoutUrl({
        offerId: offer.id,
        token,
        versionId,
      });
      window.location.assign(url);
    } catch (failure) {
      setError(errorMessage(failure, messages, workspaceName));
      setBusy(false);
      if (failure instanceof ORPCError && failure.code === "CONFLICT") {
        await queryClient.invalidateQueries({
          queryKey: orpc.extraRound.getOffer.key(),
        });
      }
    }
  }, [messages, offer.id, queryClient, token, versionId, workspaceName]);

  if (!offer.requirePayment) {
    return null;
  }
  if (offer.paidAt) {
    return (
      <Alert variant="success">
        <CircleCheckIcon aria-hidden="true" />
        <AlertDescription>
          {formatMessage(messages.paidNextVersion, {
            date: new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeStyle: "short",
            }).format(offer.paidAt),
            round: offer.round,
            workspace: workspaceName,
          })}
        </AlertDescription>
      </Alert>
    );
  }
  if (paymentReturn === "success") {
    return (
      <Alert role="status" variant="info">
        <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
        <AlertDescription>{messages.confirming}</AlertDescription>
      </Alert>
    );
  }
  if (!offer.canAccept) {
    return (
      <Alert variant="info">
        <InfoIcon aria-hidden="true" />
        <AlertDescription>
          {formatMessage(messages.waiting, { decider: offer.deciderName })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert role="alert" variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {paymentReturn === "cancelled" && !error ? (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{messages.cancelled}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {formatMessage(messages.prompt, { gross, round: offer.round })}
        </p>
        <Button disabled={busy} onClick={handlePay} size="sm" type="button">
          <CreditCardIcon aria-hidden="true" />
          {busy ? messages.paying : formatMessage(messages.pay, { gross })}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {formatMessage(messages.secure, { workspace: workspaceName })}
      </p>
    </div>
  );
}
