"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
import {
  REVIEWER_CODE_LENGTH,
  REVIEWER_CODE_VALIDITY_MINUTES,
} from "@roundcut/db/reviewer-code";
import { Button } from "@roundcut/ui/components/button";
import { Checkbox } from "@roundcut/ui/components/checkbox";
import { Field, FieldLabel } from "@roundcut/ui/components/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@roundcut/ui/components/input-otp";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  InfoIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useId, useState } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type AnswerMessages = Messages["review"]["extraRound"]["answer"];
type Offer = NonNullable<Awaited<ReturnType<typeof api.extraRound.getOffer>>>;
type Consent = NonNullable<Offer["consent"]>;
type Step = "idle" | "onlyDecider" | "code";

const DIGITS_ONLY = "^\\d+$";

const CODE_SLOTS = Array.from(
  { length: REVIEWER_CODE_LENGTH },
  (_, slot) => slot
);

function errorMessage(
  error: unknown,
  messages: AnswerMessages,
  locale: Locale
) {
  if (!(error instanceof ORPCError)) {
    return messages.error;
  }
  switch (error.code) {
    case "INVALID_CODE": {
      const count = Number(error.data?.attemptsLeft ?? 0);
      return formatMessage(
        new Intl.PluralRules(locale).select(count) === "one"
          ? messages.invalidCodeOne
          : messages.invalidCodeOther,
        { count }
      );
    }
    case "CODE_EXPIRED":
      return messages.codeExpired;
    case "TOO_MANY_REQUESTS":
      return messages.codeTooSoon;
    case "CONFLICT":
      return messages.offerClosed;
    default:
      return messages.error;
  }
}

function RecordRow({ children, label }: { children: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-36">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  );
}

// The immutable agreement record (EXTRA-03): who agreed, when in UTC, and
// the SHA-256 fingerprint sealing what was shown.
function ConsentRecord({
  consent,
  locale,
  messages,
}: {
  consent: Consent;
  locale: Locale;
  messages: AnswerMessages["record"];
}) {
  const utc = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "UTC",
  });
  return (
    <section
      aria-label={messages.title}
      className="flex flex-col gap-2 rounded-md border p-3 text-xs"
    >
      <h3 className="font-medium text-sm">{messages.title}</h3>
      <dl className="flex flex-col gap-1.5">
        <RecordRow label={messages.email}>{consent.email}</RecordRow>
        <RecordRow label={messages.time}>
          {utc.format(consent.createdAt)}
        </RecordRow>
        <RecordRow label={messages.fingerprint}>
          {consent.snapshotHash}
        </RecordRow>
      </dl>
      <p className="text-muted-foreground">{messages.sealed}</p>
    </section>
  );
}

// The decider's answer to the extra round offer (EXTRA-02, E12): "Accept"
// emails them a 6-digit code, then they tick the agreement and type the code.
// Any other reviewer is told only the decider can accept, and can forward the
// request to them by email.
export function ExtraRoundAgreement({
  locale,
  messages,
  offer,
  shownLines,
  token,
  versionId,
}: {
  locale: Locale;
  messages: AnswerMessages;
  offer: Offer;
  // The offer's text and amounts as displayed, for the agreement record.
  shownLines: string[];
  token: string;
  versionId: string;
}) {
  const queryClient = useQueryClient();
  const codeId = useId();
  const consentId = useId();
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [forwardedAt, setForwardedAt] = useState(offer.forwardedAt);
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  });
  const refreshOffer = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.extraRound.getOffer.key(),
      }),
    [queryClient]
  );

  const requestCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.review.requestOtp({
        purpose: "extra_round",
        token,
      });
      setSentTo(sent.email);
      setCode("");
      setStep("code");
    } catch (failure) {
      setError(errorMessage(failure, messages, locale));
    } finally {
      setBusy(false);
    }
  }, [locale, messages, token]);

  const handleAccept = useCallback(() => {
    if (offer.canAccept) {
      requestCode();
      return;
    }
    setError(null);
    setStep("onlyDecider");
  }, [offer.canAccept, requestCode]);

  const handleForward = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const forwarded = await api.extraRound.forward({
        offerId: offer.id,
        token,
        versionId,
      });
      setForwardedAt(forwarded.forwardedAt);
    } catch (failure) {
      setError(errorMessage(failure, messages, locale));
    } finally {
      setBusy(false);
    }
  }, [locale, messages, offer.id, token, versionId]);

  const handleConfirm = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!consent || code.length < REVIEWER_CODE_LENGTH) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api.extraRound.accept({
          agreed: true,
          code,
          offerId: offer.id,
          shown: { lines: [...shownLines, messages.consent], locale },
          token,
          versionId,
        });
        await refreshOffer();
      } catch (failure) {
        setError(errorMessage(failure, messages, locale));
        setCode("");
        if (failure instanceof ORPCError && failure.code === "CONFLICT") {
          await refreshOffer();
        }
      } finally {
        setBusy(false);
      }
    },
    [
      code,
      consent,
      locale,
      messages,
      offer.id,
      refreshOffer,
      shownLines,
      token,
      versionId,
    ]
  );

  if (offer.status === "accepted" && offer.acceptedAt) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="success">
          <CircleCheckIcon aria-hidden="true" />
          <AlertDescription>
            {formatMessage(messages.accepted, {
              date: dateTime.format(offer.acceptedAt),
              name: offer.acceptedByName ?? offer.deciderName,
              round: offer.round,
            })}
          </AlertDescription>
        </Alert>
        {offer.consent ? (
          <ConsentRecord
            consent={offer.consent}
            locale={locale}
            messages={messages.record}
          />
        ) : null}
      </div>
    );
  }

  const errorAlert = error ? (
    <Alert role="alert" variant="destructive">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (step === "code") {
    return (
      <form className="flex flex-col gap-3" onSubmit={handleConfirm}>
        {errorAlert}
        <p className="text-sm">
          {formatMessage(messages.codeSent, {
            email: sentTo,
            minutes: REVIEWER_CODE_VALIDITY_MINUTES,
          })}
        </p>
        <Field>
          <FieldLabel htmlFor={codeId}>{messages.codeLabel}</FieldLabel>
          <InputOTP
            autoComplete="one-time-code"
            disabled={busy}
            id={codeId}
            maxLength={REVIEWER_CODE_LENGTH}
            onChange={setCode}
            pattern={DIGITS_ONLY}
            value={code}
          >
            <InputOTPGroup>
              {CODE_SLOTS.map((slot) => (
                <InputOTPSlot index={slot} key={slot} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            checked={consent}
            id={consentId}
            onCheckedChange={setConsent}
          />
          <FieldLabel className="font-normal" htmlFor={consentId}>
            {messages.consent}
          </FieldLabel>
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            disabled={busy}
            onClick={requestCode}
            size="sm"
            type="button"
            variant="ghost"
          >
            {messages.resend}
          </Button>
          <Button
            disabled={busy || !consent || code.length < REVIEWER_CODE_LENGTH}
            size="sm"
            type="submit"
          >
            {busy ? messages.confirming : messages.confirm}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "onlyDecider") {
    return (
      <div className="flex flex-col gap-2">
        {errorAlert}
        <Alert variant="info">
          <InfoIcon aria-hidden="true" />
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              {formatMessage(messages.onlyDecider, {
                decider: offer.deciderName,
              })}
            </span>
            {forwardedAt ? (
              <span className="text-muted-foreground">
                {formatMessage(messages.forwarded, {
                  date: dateTime.format(forwardedAt),
                  decider: offer.deciderName,
                })}
              </span>
            ) : null}
            <Button
              disabled={busy}
              onClick={handleForward}
              size="sm"
              type="button"
              variant="outline"
            >
              <SendIcon aria-hidden="true" />
              {busy
                ? messages.forwarding
                : formatMessage(messages.forward, {
                    decider: offer.deciderName,
                  })}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {errorAlert}
      <div className="flex justify-end">
        <Button disabled={busy} onClick={handleAccept} size="sm" type="button">
          {busy ? messages.sendingCode : messages.accept}
        </Button>
      </div>
    </div>
  );
}
