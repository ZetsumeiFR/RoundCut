"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
import { EXTRA_ROUND_CONTACT_MAX_LENGTH } from "@roundcut/db/extra-round";
import { Button } from "@roundcut/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@roundcut/ui/components/field";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { Textarea } from "@roundcut/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheckIcon, CircleXIcon, MailIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

import { ApproveVersion, ErrorAlert } from "./approve-version";
import { errorMessage, type Offer } from "./extra-round-agreement";

type AnswerMessages = Messages["review"]["extraRound"]["answer"];
type Choice = "idle" | "approve" | "contact";

// "Write to the editor" (EXTRA-06): one message, emailed to the editor and
// kept in the project history.
function ContactEditor({
  locale,
  messages,
  offerId,
  onCancel,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: AnswerMessages;
  offerId: string;
  onCancel: () => void;
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const { decline } = messages;
  const messageId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setMessage(event.target.value);
      setInvalid(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = message.trim();
      if (text.length === 0) {
        setInvalid(decline.contactRequired);
        return;
      }
      if (text.length > EXTRA_ROUND_CONTACT_MAX_LENGTH) {
        setInvalid(
          formatMessage(decline.contactTooLong, {
            max: EXTRA_ROUND_CONTACT_MAX_LENGTH,
          })
        );
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api.extraRound.contactEditor({
          message: text,
          offerId,
          token,
          versionId,
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.extraRound.getOffer.key(),
        });
      } catch (failure) {
        setError(errorMessage(failure, messages, locale));
        if (failure instanceof ORPCError && failure.code === "CONFLICT") {
          await queryClient.invalidateQueries({
            queryKey: orpc.extraRound.getOffer.key(),
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [
      decline.contactRequired,
      decline.contactTooLong,
      locale,
      message,
      messages,
      offerId,
      queryClient,
      token,
      versionId,
    ]
  );

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={handleSubmit}>
      <ErrorAlert>{error}</ErrorAlert>
      <Field data-invalid={invalid ? true : undefined}>
        <FieldLabel htmlFor={messageId}>{decline.contactLabel}</FieldLabel>
        <Textarea
          aria-invalid={invalid ? true : undefined}
          disabled={busy}
          id={messageId}
          maxLength={EXTRA_ROUND_CONTACT_MAX_LENGTH}
          onChange={handleChange}
          placeholder={decline.contactPlaceholder}
          rows={4}
          value={message}
        />
        <FieldDescription>
          {formatMessage(decline.contactDescription, {
            workspace: workspaceName,
          })}
        </FieldDescription>
        {invalid ? <FieldError>{invalid}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          disabled={busy}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          {decline.cancel}
        </Button>
        <Button disabled={busy} size="sm" type="submit">
          {busy ? decline.contactSending : decline.contactSend}
        </Button>
      </div>
    </form>
  );
}

// The declined extra round (EXTRA-06): who declined it and when, then the
// decider's two ways forward, approving the current version or writing to
// the editor, and the message once sent.
export function ExtraRoundDeclined({
  locale,
  messages,
  offer,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: AnswerMessages;
  offer: Offer;
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const { decline } = messages;
  const [choice, setChoice] = useState<Choice>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  });
  const backToChoice = useCallback(() => setChoice("idle"), []);
  const openContact = useCallback(() => {
    setError(null);
    setChoice("contact");
  }, []);

  const openApprove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.review.requestOtp({ purpose: "approval", token });
      setSentTo(sent.email);
      setChoice("approve");
    } catch (failure) {
      setError(errorMessage(failure, messages, locale));
    } finally {
      setBusy(false);
    }
  }, [locale, messages, token]);

  const contacted =
    offer.contactedAt && offer.contactMessage ? (
      <div className="flex flex-col gap-1 rounded-md border p-3 text-sm">
        <p className="text-muted-foreground text-xs">
          {formatMessage(decline.contacted, {
            date: dateTime.format(offer.contactedAt),
            workspace: workspaceName,
          })}
        </p>
        <p className="whitespace-pre-line break-words">
          {offer.contactMessage}
        </p>
      </div>
    ) : null;

  let next: ReactNode = null;
  if (!offer.canAccept) {
    next = (
      <p className="text-muted-foreground text-sm">
        {formatMessage(decline.onlyDecider, {
          decider: offer.deciderName,
          workspace: workspaceName,
        })}
      </p>
    );
  } else if (choice === "approve") {
    next = (
      <ApproveVersion
        locale={locale}
        messages={messages}
        onCancel={backToChoice}
        sentTo={sentTo}
        token={token}
        versionId={versionId}
        workspaceName={workspaceName}
      />
    );
  } else if (choice === "contact" && !offer.contactedAt) {
    next = (
      <ContactEditor
        locale={locale}
        messages={messages}
        offerId={offer.id}
        onCancel={backToChoice}
        token={token}
        versionId={versionId}
        workspaceName={workspaceName}
      />
    );
  } else {
    next = (
      <div className="flex flex-col gap-2">
        <ErrorAlert>{error}</ErrorAlert>
        {offer.contactedAt ? null : (
          <p className="text-sm">
            {formatMessage(decline.choice, { workspace: workspaceName })}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {offer.contactedAt ? null : (
            <Button
              disabled={busy}
              onClick={openContact}
              size="sm"
              type="button"
              variant="outline"
            >
              <MailIcon aria-hidden="true" />
              {formatMessage(decline.contact, { workspace: workspaceName })}
            </Button>
          )}
          <Button disabled={busy} onClick={openApprove} size="sm" type="button">
            <BadgeCheckIcon aria-hidden="true" />
            {busy ? decline.approving : decline.approve}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert variant="warning">
        <CircleXIcon aria-hidden="true" />
        <AlertDescription>
          {formatMessage(decline.declined, {
            date: offer.declinedAt ? dateTime.format(offer.declinedAt) : "",
            name: offer.declinedByName ?? offer.deciderName,
            round: offer.round,
          })}
        </AlertDescription>
      </Alert>
      {contacted}
      {next}
    </div>
  );
}
