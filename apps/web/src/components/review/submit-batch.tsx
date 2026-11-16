"use client";

import { ORPCError } from "@orpc/client";
import type { Locale } from "@roundcut/auth/locale";
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
import { Badge } from "@roundcut/ui/components/reui/badge";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type SubmitMessages = Messages["review"]["submit"];

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

// The reviewer's round banner and "Submit my feedback (n)" button (REV-05).
// Once submitted, the batch is closed: new comments wait for the next round
// (REV-06) and the banner counts them.
export function SubmitBatch({
  locale,
  messages,
  token,
  versionId,
  workspaceName,
}: {
  locale: Locale;
  messages: SubmitMessages;
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
  const { includedRounds, pendingCount, round } = current.data;
  if (round === null || round.status === "closed") {
    return null;
  }
  const roundLabel = formatMessage(messages.round, {
    current: round.number,
    included: includedRounds,
  });
  const extra = round.number > includedRounds;

  if (round.status === "submitted") {
    const date = round.submittedAt
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "long",
          timeStyle: "short",
        }).format(round.submittedAt)
      : "";
    return (
      <Alert variant="info">
        <CircleCheckIcon aria-hidden="true" />
        <AlertTitle className="line-clamp-none">
          {formatMessage(messages.submittedTitle, { round: round.number })}
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

  const count = round.batchCount;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border p-2">
      <Badge variant={extra ? "warning-light" : "info-light"}>
        {roundLabel}
      </Badge>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
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
        roundNumber={round.number}
        workspaceName={workspaceName}
      />
    </div>
  );
}
