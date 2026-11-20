"use client";

import type { Locale } from "@roundcut/auth/locale";
import { REVIEWER_CODE_LENGTH } from "@roundcut/db/reviewer-code";
import { Button } from "@roundcut/ui/components/button";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheckIcon, TriangleAlertIcon } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

import { CodeConsentForm, errorMessage } from "./extra-round-agreement";

type AnswerMessages = Messages["review"]["extraRound"]["answer"];

export function ErrorAlert({ children }: { children: string | null }) {
  if (!children) {
    return null;
  }
  return (
    <Alert role="alert" variant="destructive">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// The decider's approval of the version (APPR-01, first reached from a
// declined extra round in EXTRA-06): an emailed code, the approval ticked and
// the code typed; the version becomes final.
export function ApproveVersion({
  locale,
  messages,
  onCancel,
  sentTo,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: AnswerMessages;
  onCancel: () => void;
  sentTo: string;
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const { decline } = messages;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState(sentTo);
  const description = formatMessage(decline.approveDescription, {
    workspace: workspaceName,
  });

  const handleResend = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.review.requestOtp({ purpose: "approval", token });
      setEmail(sent.email);
      setCode("");
    } catch (failure) {
      setError(errorMessage(failure, messages, locale));
    } finally {
      setBusy(false);
    }
  }, [locale, messages, token]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!consent || code.length < REVIEWER_CODE_LENGTH) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api.review.approveVersion({
          agreed: true,
          code,
          shown: { lines: [description, decline.approveConsent], locale },
          token,
          versionId,
        });
        // The round banner shows the approval; any offer goes away.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.review.round.key() }),
          queryClient.invalidateQueries({
            queryKey: orpc.extraRound.getOffer.key(),
          }),
        ]);
      } catch (failure) {
        setError(errorMessage(failure, messages, locale));
        setCode("");
      } finally {
        setBusy(false);
      }
    },
    [
      code,
      consent,
      decline.approveConsent,
      description,
      locale,
      messages,
      queryClient,
      token,
      versionId,
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{description}</p>
      <CodeConsentForm
        busy={busy}
        code={code}
        confirmLabel={decline.approveConfirm}
        consent={consent}
        consentLabel={decline.approveConsent}
        error={<ErrorAlert>{error}</ErrorAlert>}
        messages={messages}
        onCancel={onCancel}
        onCodeChange={setCode}
        onConsentChange={setConsent}
        onResend={handleResend}
        onSubmit={handleSubmit}
        sentTo={email}
      />
    </div>
  );
}

// "Approve this version" (APPR-01): the decider's button under the round
// banner, whatever the round's state, which emails the code and opens the
// approval form.
export function ApproveVersionAction({
  locale,
  messages,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: AnswerMessages;
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { approval } = messages;
  const close = useCallback(() => setSentTo(null), []);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.review.requestOtp({ purpose: "approval", token });
      setSentTo(sent.email);
    } catch (failure) {
      setError(errorMessage(failure, messages, locale));
    } finally {
      setBusy(false);
    }
  }, [locale, messages, token]);

  return (
    <section
      aria-label={approval.title}
      className="flex flex-col gap-2 border p-3"
    >
      {sentTo === null ? (
        <>
          <ErrorAlert>{error}</ErrorAlert>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-muted-foreground text-xs">
              {approval.hint}
            </p>
            <Button disabled={busy} onClick={open} size="sm" type="button">
              <BadgeCheckIcon aria-hidden="true" data-icon="inline-start" />
              {busy ? messages.decline.approving : approval.action}
            </Button>
          </div>
        </>
      ) : (
        <ApproveVersion
          locale={locale}
          messages={messages}
          onCancel={close}
          sentTo={sentTo}
          token={token}
          versionId={versionId}
          workspaceName={workspaceName}
        />
      )}
    </section>
  );
}
