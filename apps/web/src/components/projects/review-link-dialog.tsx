"use client";

import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@roundcut/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@roundcut/ui/components/input-group";
import { Label } from "@roundcut/ui/components/label";
import { Alert, AlertDescription } from "@roundcut/ui/components/reui/alert";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  LinkIcon,
  MailIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useId, useState } from "react";
import { toast } from "sonner";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client, orpc } from "@/utils/orpc";

type LinkMessages = Messages["projects"]["reviewLink"];
type ReviewLink = NonNullable<
  Awaited<ReturnType<AppRouterClient["reviewLink"]["get"]>>
>;

const EXPIRY_PRESETS = ["never", "7", "30", "90"] as const;
type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;

const isExpiryPreset = (value: unknown): value is ExpiryPreset =>
  EXPIRY_PRESETS.some((preset) => preset === value);

const expiryDate = (preset: ExpiryPreset) =>
  preset === "never" ? null : new Date(Date.now() + Number(preset) * DAY_MS);

const presetLabel = (messages: LinkMessages, preset: ExpiryPreset) =>
  preset === "never"
    ? messages.expiry.never
    : formatMessage(messages.expiry.days, { count: preset });

const reviewUrl = (token: string) => `${window.location.origin}/r/${token}`;

function ExpirySelect({
  disabled,
  label,
  messages,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  messages: LinkMessages;
  onChange: (preset: ExpiryPreset) => void;
  value: ExpiryPreset | null;
}) {
  const handleChange = useCallback(
    (next: unknown) => {
      if (isExpiryPreset(next)) {
        onChange(next);
      }
    },
    [onChange]
  );
  return (
    <Select disabled={disabled} onValueChange={handleChange} value={value}>
      <SelectTrigger aria-label={messages.expiry.label} className="w-full">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {EXPIRY_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {presetLabel(messages, preset)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function IssuedUrl({ messages, url }: { messages: LinkMessages; url: string }) {
  const id = useId();
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(messages.copied);
    } catch {
      toast.error(messages.copyError);
    }
  }, [messages, url]);
  const selectAll = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
    []
  );
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{messages.urlLabel}</Label>
      <InputGroup>
        <InputGroupInput
          className="font-mono text-xs"
          id={id}
          onFocus={selectAll}
          readOnly
          value={url}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={messages.copy}
            onClick={handleCopy}
            size="icon-xs"
            title={messages.copy}
          >
            <CopyIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-muted-foreground text-xs">{messages.newLinkHint}</p>
    </div>
  );
}

type SendState =
  | { status: "idle" | "sending" }
  | { failed: string[]; sent: string[]; status: "sent" };

// Emails the link just generated to the client's decider and reviewers
// (NOTIF-01): only possible while its token is on screen.
function SendLinkEmail({
  messages,
  projectId,
  token,
}: {
  messages: LinkMessages;
  projectId: string;
  token: string;
}) {
  const [state, setState] = useState<SendState>({ status: "idle" });
  const send = useCallback(async () => {
    setState({ status: "sending" });
    try {
      const result = await client.reviewLink.sendEmail({ projectId, token });
      setState({ ...result, status: "sent" });
      toast.success(
        formatMessage(messages.email.sent, { emails: result.sent.join(", ") })
      );
    } catch {
      setState({ status: "idle" });
      toast.error(messages.email.error);
    }
  }, [messages.email, projectId, token]);
  let label = messages.email.send;
  if (state.status === "sending") {
    label = messages.email.sending;
  } else if (state.status === "sent") {
    label = messages.email.resend;
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={state.status === "sending"}
        onClick={send}
        type="button"
        variant="outline"
      >
        <MailIcon aria-hidden="true" data-icon="inline-start" />
        {label}
      </Button>
      {state.status === "sent" ? (
        <p className="text-muted-foreground text-xs" role="status">
          {formatMessage(messages.email.sent, {
            emails: state.sent.join(", "),
          })}
        </p>
      ) : null}
      {state.status === "sent" && state.failed.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>
            {formatMessage(messages.email.failed, {
              emails: state.failed.join(", "),
            })}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

type Confirm = "regenerate" | "revoke";

function ActiveLink({
  busy,
  issuedToken,
  link,
  locale,
  messages,
  onConfirm,
  onExpiryChange,
  projectId,
}: {
  busy: boolean;
  issuedToken: string | null;
  link: ReviewLink;
  locale: Locale;
  messages: LinkMessages;
  onConfirm: (action: Confirm) => void;
  onExpiryChange: (preset: ExpiryPreset) => void;
  projectId: string;
}) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const regenerate = useCallback(() => onConfirm("regenerate"), [onConfirm]);
  const revoke = useCallback(() => onConfirm("revoke"), [onConfirm]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={link.expired ? "warning-light" : "success-light"}>
          {link.expired ? messages.expired : messages.active}
        </Badge>
        <span className="text-muted-foreground">
          {formatMessage(messages.createdAt, {
            date: date.format(link.createdAt),
          })}
        </span>
      </div>
      {issuedToken ? (
        <>
          <IssuedUrl messages={messages} url={reviewUrl(issuedToken)} />
          {link.expired ? null : (
            <SendLinkEmail
              messages={messages}
              projectId={projectId}
              token={issuedToken}
            />
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {messages.hiddenDescription}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{messages.expiry.label}</span>
        <ExpirySelect
          disabled={busy}
          label={
            link.expiresAt
              ? formatMessage(
                  link.expired ? messages.expiredOn : messages.expiresAt,
                  {
                    date: date.format(link.expiresAt),
                  }
                )
              : messages.expiry.never
          }
          messages={messages}
          onChange={onExpiryChange}
          value={null}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={regenerate}
          type="button"
          variant="outline"
        >
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          {messages.regenerate}
        </Button>
        <Button
          disabled={busy}
          onClick={revoke}
          type="button"
          variant="destructive"
        >
          {messages.revoke}
        </Button>
      </div>
    </div>
  );
}

function NewLink({
  busy,
  messages,
  onGenerate,
}: {
  busy: boolean;
  messages: LinkMessages;
  onGenerate: (preset: ExpiryPreset) => void;
}) {
  const [preset, setPreset] = useState<ExpiryPreset>("never");
  const generate = useCallback(() => onGenerate(preset), [onGenerate, preset]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 border border-dashed px-4 py-6 text-center">
        <LinkIcon aria-hidden="true" className="mb-1 size-5" />
        <p className="font-medium text-sm">{messages.emptyTitle}</p>
        <p className="text-muted-foreground text-sm">
          {messages.emptyDescription}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{messages.expiry.label}</span>
        <ExpirySelect
          disabled={busy}
          label={presetLabel(messages, preset)}
          messages={messages}
          onChange={setPreset}
          value={preset}
        />
      </div>
      <Button disabled={busy} onClick={generate} type="button">
        <LinkIcon aria-hidden="true" data-icon="inline-start" />
        {messages.generate}
      </Button>
    </div>
  );
}

function ConfirmPanel({
  action,
  busy,
  cancel,
  messages,
  onCancel,
  onConfirm,
}: {
  action: Confirm;
  busy: boolean;
  cancel: string;
  messages: LinkMessages;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy =
    action === "regenerate"
      ? messages.regenerateConfirm
      : messages.revokeConfirm;
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription>
          <p className="font-medium">{copy.title}</p>
          <p>{copy.description}</p>
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          {cancel}
        </Button>
        <Button
          disabled={busy}
          onClick={onConfirm}
          type="button"
          variant={action === "revoke" ? "destructive" : "default"}
        >
          {action === "revoke" ? messages.revoke : messages.regenerate}
        </Button>
      </div>
    </div>
  );
}

function ReviewLinkPanel({
  cancel,
  locale,
  messages,
  projectId,
  retry,
}: {
  cancel: string;
  locale: Locale;
  messages: LinkMessages;
  projectId: string;
  retry: string;
}) {
  const queryClient = useQueryClient();
  const link = useQuery(
    orpc.reviewLink.get.queryOptions({
      input: { projectId },
      meta: { inlineError: true },
    })
  );
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch {
        toast.error(messages.error);
      } finally {
        await queryClient.invalidateQueries({
          queryKey: orpc.reviewLink.key(),
        });
        setBusy(false);
      }
    },
    [messages.error, queryClient]
  );

  const generate = useCallback(
    (preset: ExpiryPreset) =>
      run(async () => {
        const { token } = await client.reviewLink.create({
          expiresAt: expiryDate(preset),
          projectId,
        });
        setIssuedToken(token);
      }),
    [projectId, run]
  );
  const changeExpiry = useCallback(
    (preset: ExpiryPreset) =>
      run(async () => {
        await client.reviewLink.updateExpiry({
          expiresAt: expiryDate(preset),
          projectId,
        });
        toast.success(messages.expiry.saved);
      }),
    [messages.expiry.saved, projectId, run]
  );
  const cancelConfirm = useCallback(() => setConfirm(null), []);
  const confirmAction = useCallback(async () => {
    if (confirm === "revoke") {
      await run(async () => {
        await client.reviewLink.revoke({ projectId });
        setIssuedToken(null);
        toast.success(messages.revoked);
      });
    } else {
      await run(async () => {
        const current = link.data;
        const { token } = await client.reviewLink.create({
          // A regenerated link keeps the expiry date that is still ahead.
          expiresAt:
            current?.expiresAt && !current.expired ? current.expiresAt : null,
          projectId,
        });
        setIssuedToken(token);
      });
    }
    setConfirm(null);
  }, [confirm, link.data, messages.revoked, projectId, run]);
  const refetch = useCallback(() => link.refetch(), [link]);

  if (link.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{messages.loadError}</AlertDescription>
        </Alert>
        <Button onClick={refetch} type="button" variant="outline">
          {retry}
        </Button>
      </div>
    );
  }
  if (link.data === undefined) {
    return (
      <div
        aria-label={messages.loading}
        className="flex flex-col gap-3"
        role="status"
      >
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-48" />
      </div>
    );
  }
  if (confirm && link.data) {
    return (
      <ConfirmPanel
        action={confirm}
        busy={busy}
        cancel={cancel}
        messages={messages}
        onCancel={cancelConfirm}
        onConfirm={confirmAction}
      />
    );
  }
  return link.data ? (
    <ActiveLink
      busy={busy}
      issuedToken={issuedToken}
      link={link.data}
      locale={locale}
      messages={messages}
      onConfirm={setConfirm}
      onExpiryChange={changeExpiry}
      projectId={projectId}
    />
  ) : (
    <NewLink busy={busy} messages={messages} onGenerate={generate} />
  );
}

export function ReviewLinkDialog({
  cancel,
  locale,
  messages,
  onOpenChange,
  open,
  projectId,
  retry,
}: {
  cancel: string;
  locale: Locale;
  messages: LinkMessages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: string;
  retry: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{messages.title}</DialogTitle>
          <DialogDescription>{messages.description}</DialogDescription>
        </DialogHeader>
        {/* Mounted while open: a generated URL is never shown again once
            the dialog closes, since only its hash is stored. */}
        {open ? (
          <ReviewLinkPanel
            cancel={cancel}
            locale={locale}
            messages={messages}
            projectId={projectId}
            retry={retry}
          />
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {messages.close}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
