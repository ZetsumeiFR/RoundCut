"use client";

import { Button } from "@roundcut/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

type Answer = "accept" | "decline";

export function InvitationActions({
  afterAccept,
  afterDecline,
  invitationId,
  messages,
}: {
  afterAccept?: Route;
  afterDecline?: Route;
  invitationId: string;
  messages: {
    accept: string;
    accepting: string;
    actionError: string;
    decline: string;
    declining?: string;
  };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Answer | null>(null);

  const answer = useCallback(
    async (choice: Answer) => {
      setPending(choice);
      try {
        const { error } =
          choice === "accept"
            ? await authClient.organization.acceptInvitation({ invitationId })
            : await authClient.organization.rejectInvitation({ invitationId });
        if (error) {
          toast.error(messages.actionError);
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: orpc.team.get.queryKey(),
        });
        const next = choice === "accept" ? afterAccept : afterDecline;
        if (next) {
          router.push(next);
        }
      } finally {
        setPending(null);
      }
    },
    [afterAccept, afterDecline, invitationId, messages, queryClient, router]
  );

  const accept = useCallback(() => answer("accept"), [answer]);
  const decline = useCallback(() => answer("decline"), [answer]);

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending !== null} onClick={accept} size="sm">
        {pending === "accept" ? messages.accepting : messages.accept}
      </Button>
      <Button
        disabled={pending !== null}
        onClick={decline}
        size="sm"
        variant="outline"
      >
        {pending === "decline"
          ? (messages.declining ?? messages.decline)
          : messages.decline}
      </Button>
    </div>
  );
}
