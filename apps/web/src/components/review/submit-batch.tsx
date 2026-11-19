"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
import { needsExtraRound } from "@roundcut/db/extra-round";
import type {
  ManualCloseReason,
  RoundKind,
  RoundStatus,
} from "@roundcut/db/round";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@roundcut/ui/components/alert-dialog";
import { Button } from "@roundcut/ui/components/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheckIcon,
  CircleCheckIcon,
  GiftIcon,
  RepeatIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { ExtraRoundOffer } from "./extra-round-offer";
import { ReceiptDownloadButton } from "./receipt-download-button";

type SubmitMessages = Messages["review"]["submit"];

interface BannerRound {
  closedAt: Date | null;
  closedNote: string | null;
  giftNote: string | null;
  kind: RoundKind;
  manualCloseReason: ManualCloseReason | null;
  // Place in the counter, per deliverable or per project (ROUND-02).
  position: number;
  status: RoundStatus;
}

// How a closed round reads to the client: the editor's reason and note when
// the editor closed it by hand (ROUND-03).
function closedLines(
  round: BannerRound,
  closing: { locale: Locale; messages: SubmitMessages; workspaceName: string }
) {
  const { locale, messages, workspaceName } = closing;
  if (!(round.manualCloseReason && round.closedAt)) {
    return [formatMessage(messages.roundClosed, { round: round.position })];
  }
  const lines = [
    formatMessage(messages.closedManually, {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
        round.closedAt
      ),
      round: round.position,
      workspace: workspaceName,
    }),
    messages.manualReasons[round.manualCloseReason],
  ];
  if (round.closedNote) {
    lines.push(
      formatMessage(messages.closedNote, {
        note: round.closedNote,
        workspace: workspaceName,
      })
    );
  }
  return lines;
}

// What the permanent banner says about the round (REV-07): a round within
// the included ones, the included rounds used up (the last included round is
// submitted or closed, or the round is beyond them), and whether it is closed.
function bannerLines(
  round: BannerRound,
  includedRounds: number,
  closing: { locale: Locale; messages: SubmitMessages; workspaceName: string }
) {
  const { messages, workspaceName } = closing;
  // A round the editor offered (ROUND-06) reads as a gift, not as the
  // included rounds running out.
  if (round.kind === "gift") {
    const lines = [
      formatMessage(messages.giftDescription, { current: round.position }),
    ];
    if (round.giftNote) {
      lines.push(
        formatMessage(messages.closedNote, {
          note: round.giftNote,
          workspace: workspaceName,
        })
      );
    }
    if (round.status === "closed") {
      lines.push(...closedLines(round, closing));
    }
    return {
      gift: true,
      lines,
      title: formatMessage(messages.gift, { workspace: workspaceName }),
      warning: false,
    };
  }
  // An extra round the client agreed to (and paid, EXTRA-04) is granted:
  // the included rounds running out no longer applies to it.
  if (round.kind === "extra") {
    const lines = [messages.extraGrantedDescription];
    if (round.status === "closed") {
      lines.push(...closedLines(round, closing));
    }
    return {
      gift: false,
      lines,
      title: formatMessage(messages.extraGranted, { current: round.position }),
      warning: false,
    };
  }
  const extra = round.position > includedRounds;
  const lastIncluded = round.position === includedRounds;
  const exhausted = extra || (lastIncluded && round.status !== "open");
  const label = formatMessage(extra ? messages.extraRound : messages.round, {
    current: round.position,
    included: includedRounds,
  });
  const lines: string[] = [];
  if (exhausted) {
    lines.push(
      label,
      formatMessage(messages.exhaustedDescription, {
        included: includedRounds,
      })
    );
  } else if (lastIncluded) {
    lines.push(messages.lastIncluded);
  }
  if (round.status === "closed") {
    lines.push(...closedLines(round, closing));
  }
  return {
    gift: false,
    lines,
    title: exhausted ? messages.exhausted : label,
    warning: exhausted,
  };
}

// The reviewer's permanent round banner (REV-07): shown whatever the round's
// state, or the decider's final approval once the version is approved.
function RoundBanner({
  approval,
  includedRounds,
  locale,
  messages,
  receipt,
  round,
  workspaceName,
}: {
  approval: { approvedAt: Date; approverName: string } | null;
  includedRounds: number;
  locale: Locale;
  messages: SubmitMessages;
  // The agreement receipt of an extra round the client agreed to (EXTRA-07).
  receipt: ReactNode;
  round: BannerRound | null;
  workspaceName: string;
}) {
  if (approval) {
    return (
      <Alert variant="success">
        <BadgeCheckIcon aria-hidden="true" />
        <AlertTitle className="line-clamp-none">
          {formatMessage(messages.approved, {
            date: new Intl.DateTimeFormat(locale, {
              day: "2-digit",
              month: "2-digit",
            }).format(approval.approvedAt),
            name: approval.approverName,
          })}
        </AlertTitle>
      </Alert>
    );
  }
  if (round === null) {
    return null;
  }
  const { gift, lines, title, warning } = bannerLines(round, includedRounds, {
    locale,
    messages,
    workspaceName,
  });
  let icon = <RepeatIcon aria-hidden="true" />;
  if (gift) {
    icon = <GiftIcon aria-hidden="true" />;
  } else if (warning) {
    icon = <TriangleAlertIcon aria-hidden="true" />;
  }
  return (
    <Alert variant={warning ? "warning" : "info"}>
      {icon}
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      {lines.length > 0 ? (
        <AlertDescription>
          {lines.map((line) => (
            <p className="whitespace-pre-line" key={line}>
              {line}
            </p>
          ))}
          {receipt ? <div className="pt-1">{receipt}</div> : null}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

function ConfirmSubmitDialog({
  busy,
  messages,
  onConfirm,
  onOpenChange,
  open,
  roundNumber,
  workspaceName,
}: {
  busy: boolean;
  messages: SubmitMessages;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  roundNumber: number;
  workspaceName: string;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{messages.confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {formatMessage(messages.confirmDescription, {
              next: roundNumber + 1,
              round: roundNumber,
              workspace: workspaceName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{messages.cancel}</AlertDialogCancel>
          <Button disabled={busy} onClick={onConfirm} type="button">
            {busy ? messages.submitting : messages.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// What the reviewer sees once the round's batch is submitted (REV-05), with
// the comments already waiting for the next round (REV-06).
function SubmittedNotice({
  locale,
  messages,
  pendingCount,
  position,
  submittedAt,
  workspaceName,
}: {
  locale: Locale;
  messages: SubmitMessages;
  pendingCount: number;
  position: number;
  submittedAt: Date | null;
  workspaceName: string;
}) {
  const date = submittedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
      }).format(submittedAt)
    : "";
  return (
    <Alert variant="info">
      <CircleCheckIcon aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        {formatMessage(messages.submittedTitle, { round: position })}
      </AlertTitle>
      <AlertDescription>
        <p>
          {formatMessage(messages.submittedDescription, {
            date,
            workspace: workspaceName,
          })}
        </p>
        {pendingCount > 0 ? (
          <p className="font-medium">
            {formatMessage(
              new Intl.PluralRules(locale).select(pendingCount) === "one"
                ? messages.pendingOne
                : messages.pendingOther,
              { count: pendingCount }
            )}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

// The reviewer's permanent round banner (REV-07) and "Submit my feedback (n)"
// button (REV-05). Once submitted, the batch is closed: new comments wait for
// the next round (REV-06) and the submitted notice counts them. Beyond the
// included rounds, the extra round offer (EXTRA-01) replaces the button as
// soon as the client starts a new batch.
export function SubmitBatch({
  locale,
  messages,
  offerMessages,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: SubmitMessages;
  offerMessages: Messages["review"]["extraRound"];
  token: string;
  versionId: string;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const current = useQuery(
    orpc.review.round.queryOptions({
      input: { token, versionId },
      meta: { inlineError: true },
    })
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const refetchRound = current.refetch;
  const handleRetry = useCallback(() => refetchRound(), [refetchRound]);
  const openConfirm = useCallback(() => setConfirming(true), []);
  const agreementOfferId = current.data?.round?.agreementOfferId ?? null;
  const fetchReceipt = useCallback(
    () =>
      api.extraRound.receipt({
        locale,
        offerId: agreementOfferId ?? "",
        token,
      }),
    [agreementOfferId, locale, token]
  );

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      await api.review.submitBatch({ token, versionId });
      toast.success(
        formatMessage(messages.submitted, { workspace: workspaceName })
      );
    } catch (error) {
      toast.error(
        error instanceof ORPCError && error.code === "CONFLICT"
          ? messages.alreadySubmitted
          : messages.error
      );
    } finally {
      setBusy(false);
      setConfirming(false);
      await queryClient.invalidateQueries({
        queryKey: orpc.review.round.key(),
      });
    }
  }, [messages, queryClient, token, versionId, workspaceName]);

  if (current.isError) {
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
  if (!current.data) {
    return (
      <Skeleton
        aria-label={messages.loading}
        className="h-9 w-full"
        role="status"
      />
    );
  }
  const { approval, includedRounds, pendingCount, round } = current.data;
  const banner = (
    <RoundBanner
      approval={approval}
      includedRounds={includedRounds}
      locale={locale}
      messages={messages}
      receipt={
        round?.kind === "extra" && agreementOfferId ? (
          <ReceiptDownloadButton
            fetchReceipt={fetchReceipt}
            messages={offerMessages.answer.record}
          />
        ) : null
      }
      round={round}
      workspaceName={workspaceName}
    />
  );
  const offer = (
    <ExtraRoundOffer
      locale={locale}
      messages={offerMessages}
      token={token}
      versionId={versionId}
      workspaceName={workspaceName}
    />
  );
  if (approval || round === null) {
    return banner;
  }
  const extraRoundNeeded = needsExtraRound(round, includedRounds);
  if (round.status === "closed") {
    return extraRoundNeeded && pendingCount > 0 ? (
      <div className="flex flex-col gap-2">
        {banner}
        {offer}
      </div>
    ) : (
      banner
    );
  }

  if (round.status === "submitted") {
    return (
      <div className="flex flex-col gap-2">
        {banner}
        <SubmittedNotice
          locale={locale}
          messages={messages}
          pendingCount={pendingCount}
          position={round.position}
          submittedAt={round.submittedAt}
          workspaceName={workspaceName}
        />
        {extraRoundNeeded && pendingCount > 0 ? offer : null}
      </div>
    );
  }

  const count = round.batchCount;
  // A round beyond the included ones, neither offered nor granted yet: its
  // comments wait for the extra round agreement instead of being submitted.
  if (extraRoundNeeded) {
    return (
      <div className="flex flex-col gap-2">
        {banner}
        {count > 0 ? (
          offer
        ) : (
          <p className="border p-2 text-muted-foreground text-xs">
            {offerMessages.hint}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {banner}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border p-2">
        {count === 0 ? (
          <span className="text-muted-foreground text-xs">
            {messages.empty}
          </span>
        ) : null}
        <Button
          disabled={count === 0}
          onClick={openConfirm}
          size="sm"
          type="button"
        >
          <SendIcon aria-hidden="true" data-icon="inline-start" />
          {formatMessage(messages.action, { count })}
        </Button>
      </div>
      <ConfirmSubmitDialog
        busy={busy}
        messages={messages}
        onConfirm={handleConfirm}
        onOpenChange={setConfirming}
        open={confirming}
        roundNumber={round.position}
        workspaceName={workspaceName}
      />
    </div>
  );
}
