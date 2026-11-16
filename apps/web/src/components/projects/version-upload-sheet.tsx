"use client";

import { ORPCError } from "@orpc/client";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import { isVideoType, MAX_UPLOAD_BYTES } from "@roundcut/api/upload";
import type { Locale } from "@roundcut/auth/locale";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@roundcut/ui/components/attachment";
import { Button } from "@roundcut/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import { Progress } from "@roundcut/ui/components/progress";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@roundcut/ui/components/sheet";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import { Spinner } from "@roundcut/ui/components/spinner";
import { cn } from "@roundcut/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CircleAlertIcon,
  ClapperboardIcon,
  FileVideoIcon,
  PauseIcon,
  RotateCwIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { sendFile, type UploadPlan } from "./version-upload";

type ProjectsMessages = Messages["projects"];
type VersionMessages = ProjectsMessages["versions"];
type Version = Awaited<ReturnType<AppRouterClient["version"]["list"]>>[number];

export interface UploadTarget {
  id: string;
  title: string;
}

type Upload =
  | { file: File; phase: "uploading"; progress: number; version: Version }
  | { file: File; phase: "failed"; progress: number; version: Version }
  | { phase: "done"; version: Version };

type Problem =
  | { kind: "notVideo" | "tooLarge"; name: string }
  | { kind: "conflict" | "startError" | "cancelError" }
  | { kind: "mismatch"; name: string; size: number };

const SKELETON_ROWS = ["first", "second"];
const PERCENT = 100;

const sizeUnits = [
  { bytes: 1024 ** 3, unit: "gigabyte" },
  { bytes: 1024 ** 2, unit: "megabyte" },
  { bytes: 1024, unit: "kilobyte" },
  { bytes: 1, unit: "byte" },
] as const;

export function formatBytes(bytes: number, locale: Locale) {
  const { bytes: size, unit } =
    sizeUnits.find((item) => bytes >= item.bytes) ?? sizeUnits[3];
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: size >= 1024 ** 2 ? 1 : 0,
    style: "unit",
    unit,
  }).format(bytes / size);
}

const isConflict = (error: unknown) =>
  error instanceof ORPCError && error.code === "CONFLICT";

function describeProblem(
  problem: Problem,
  messages: VersionMessages,
  locale: Locale
): { description?: string; title: string } {
  switch (problem.kind) {
    case "notVideo":
      return {
        description: messages.notVideo.description,
        title: formatMessage(messages.notVideo.title, { name: problem.name }),
      };
    case "tooLarge":
      return {
        description: formatMessage(messages.tooLarge.description, {
          max: formatBytes(MAX_UPLOAD_BYTES, locale),
        }),
        title: formatMessage(messages.tooLarge.title, { name: problem.name }),
      };
    case "mismatch":
      return {
        title: formatMessage(messages.mismatch, {
          name: problem.name,
          size: formatBytes(problem.size, locale),
        }),
      };
    default:
      return { title: messages[problem.kind] };
  }
}

function ProblemAlert({
  locale,
  messages,
  problem,
}: {
  locale: Locale;
  messages: VersionMessages;
  problem: Problem;
}) {
  const { description, title } = describeProblem(problem, messages, locale);
  return (
    <Alert role="alert" variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}

function Dropzone({
  disabled,
  locale,
  messages,
  onFile,
}: {
  disabled: boolean;
  locale: Locale;
  messages: VersionMessages;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);

  const openPicker = useCallback(() => inputRef.current?.click(), []);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        onFile(file);
      }
    },
    [onFile]
  );
  const handleDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(!disabled);
    },
    [disabled]
  );
  const handleDragLeave = useCallback(() => setDragging(false), []);
  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(false);
      const [file] = event.dataTransfer.files;
      if (file && !disabled) {
        onFile(file);
      }
    },
    [disabled, onFile]
  );

  return (
    <>
      <input
        accept="video/*"
        className="sr-only"
        disabled={disabled}
        onChange={handleChange}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <button
        aria-describedby={hintId}
        className={cn(
          "group/dropzone flex w-full flex-col items-center gap-3 border border-dashed px-4 py-8 text-center outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        disabled={disabled}
        onClick={openPicker}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        type="button"
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            dragging ? "bg-primary/10 text-primary" : "bg-muted"
          )}
        >
          <UploadIcon aria-hidden="true" className="size-5" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="font-medium text-sm">{messages.drop}</span>
          <span className="text-muted-foreground text-xs">{messages.or}</span>
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 bg-primary px-2.5 font-medium text-primary-foreground text-xs transition-colors group-hover/dropzone:bg-primary/80">
          <FileVideoIcon aria-hidden="true" className="size-4" />
          {messages.select}
        </span>
        <span className="text-muted-foreground text-xs" id={hintId}>
          {formatMessage(messages.formats, {
            max: formatBytes(MAX_UPLOAD_BYTES, locale),
          })}
        </span>
      </button>
    </>
  );
}

function UploadRow({
  locale,
  messages,
  onCancel,
  onResume,
  upload,
}: {
  locale: Locale;
  messages: VersionMessages;
  onCancel: () => void;
  onResume: () => void;
  upload: Extract<Upload, { phase: "uploading" | "failed" }>;
}) {
  const { file, phase, progress } = upload;
  const percent = new Intl.NumberFormat(locale, { style: "percent" }).format(
    progress
  );
  const detail = formatMessage(messages.progress, {
    loaded: formatBytes(Math.round(progress * file.size), locale),
    percent,
    total: formatBytes(file.size, locale),
  });
  const failed = phase === "failed";
  return (
    <div className="flex flex-col gap-2">
      <Attachment className="w-full" state={failed ? "error" : "uploading"}>
        <AttachmentMedia>
          {failed ? <PauseIcon aria-hidden="true" /> : <Spinner />}
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>
            {formatMessage(messages.version, {
              number: upload.version.number,
            })}{" "}
            · {file.name}
          </AttachmentTitle>
          <AttachmentDescription aria-live="polite">
            {detail}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          {failed ? (
            <AttachmentAction
              aria-label={formatMessage(messages.resume, { name: file.name })}
              onClick={onResume}
            >
              <RotateCwIcon aria-hidden="true" />
            </AttachmentAction>
          ) : null}
          <AttachmentAction
            aria-label={formatMessage(messages.cancel, { name: file.name })}
            onClick={onCancel}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Progress
        aria-label={file.name}
        className="gap-0"
        locale={locale}
        value={Math.round(progress * PERCENT)}
      />
      <p className="text-muted-foreground text-xs">
        {failed ? messages.uploadError : messages.uploading}
      </p>
    </div>
  );
}

function InterruptedRow({
  locale,
  messages,
  onCancel,
  onFile,
  version,
}: {
  locale: Locale;
  messages: VersionMessages;
  onCancel: () => void;
  onFile: (file: File) => void;
  version: Version;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = useCallback(() => inputRef.current?.click(), []);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        onFile(file);
      }
    },
    [onFile]
  );
  return (
    <div className="flex flex-col gap-2">
      <Attachment className="w-full" state="error">
        <AttachmentMedia>
          <PauseIcon aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>
            {formatMessage(messages.version, { number: version.number })} ·{" "}
            {version.fileName}
          </AttachmentTitle>
          <AttachmentDescription>
            {messages.status.interrupted} ·{" "}
            {formatBytes(version.sizeBytes, locale)}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            aria-label={formatMessage(messages.cancel, {
              name: version.fileName,
            })}
            onClick={onCancel}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <p className="text-muted-foreground text-xs">{messages.interrupted}</p>
      <input
        accept="video/*"
        className="sr-only"
        onChange={handleChange}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <Button
        className="self-start"
        onClick={openPicker}
        type="button"
        variant="outline"
      >
        <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
        {messages.selectAgain}
      </Button>
    </div>
  );
}

const STATUS_BADGES = {
  approved: "success-light",
  ready: "outline",
  uploading: "warning-light",
} as const;

function VersionList({
  locale,
  messages,
  query,
}: {
  locale: Locale;
  messages: VersionMessages;
  query: ReturnType<typeof useVersions>;
}) {
  const { refetch } = query;
  const retry = useCallback(() => refetch(), [refetch]);
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>{messages.loadError}</AlertTitle>
        <AlertDescription>
          <Button onClick={retry} size="sm" type="button" variant="outline">
            {messages.retry}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!query.data) {
    return (
      <div
        aria-label={messages.loading}
        className="flex flex-col gap-2"
        role="status"
      >
        {SKELETON_ROWS.map((row) => (
          <Skeleton className="h-12 w-full" key={row} />
        ))}
      </div>
    );
  }
  const finished = query.data.filter((item) => item.status !== "uploading");
  if (finished.length === 0) {
    return (
      <Empty className="flex-none border border-dashed py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClapperboardIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{messages.emptyTitle}</EmptyTitle>
          <EmptyDescription>{messages.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <ul className="flex flex-col gap-2">
      {finished.map((item) => (
        <li key={item.id}>
          <Attachment className="w-full" state="done">
            <AttachmentMedia>
              <CheckIcon aria-hidden="true" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>
                {formatMessage(messages.version, { number: item.number })} ·{" "}
                {item.fileName}
              </AttachmentTitle>
              <AttachmentDescription>
                {formatBytes(item.sizeBytes, locale)} ·{" "}
                {date.format(new Date(item.createdAt))}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <Badge variant={STATUS_BADGES[item.status]}>
                {messages.status[item.status]}
              </Badge>
            </AttachmentActions>
          </Attachment>
        </li>
      ))}
    </ul>
  );
}

function useVersions(deliverableId: string) {
  return useQuery(
    orpc.version.list.queryOptions({
      input: { deliverableId },
      meta: { inlineError: true },
    })
  );
}

function VersionUploadPanel({
  deliverable,
  locale,
  messages,
  onBusyChange,
}: {
  deliverable: UploadTarget;
  locale: Locale;
  messages: VersionMessages;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const versions = useVersions(deliverable.id);
  const [upload, setUpload] = useState<Upload | undefined>();
  const [problem, setProblem] = useState<Problem | undefined>();
  const [starting, setStarting] = useState(false);
  const controller = useRef<AbortController>(undefined);
  const busy = starting || upload?.phase === "uploading";

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => {
    if (!busy) {
      return;
    }
    // Leaving mid-upload interrupts it: ask the browser to confirm.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => () => controller.current?.abort(), []);

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.version.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.project.key() }),
      ]),
    [queryClient]
  );

  const run = useCallback(
    async (
      file: File,
      version: Version,
      plan: UploadPlan,
      uploadedParts: number[]
    ) => {
      const abort = new AbortController();
      controller.current = abort;
      setUpload({ file, phase: "uploading", progress: 0, version });
      try {
        await sendFile({
          file,
          onProgress: (progress) =>
            setUpload((current) =>
              current?.phase === "uploading"
                ? { ...current, progress }
                : current
            ),
          plan,
          signal: abort.signal,
          uploadedParts,
          versionId: version.id,
        });
        const ready = await api.upload.completeUpload({
          versionId: version.id,
        });
        setUpload({ phase: "done", version: ready });
        toast.success(
          formatMessage(messages.uploadedToast, {
            number: ready.number,
            title: deliverable.title,
          })
        );
        await refresh();
      } catch {
        if (abort.signal.aborted) {
          return;
        }
        setUpload((current) =>
          current?.phase === "uploading"
            ? { ...current, phase: "failed" }
            : current
        );
      }
    },
    [deliverable.title, messages.uploadedToast, refresh]
  );

  const resume = useCallback(
    async (file: File, version: Version) => {
      setProblem(undefined);
      setStarting(true);
      try {
        const resumed = await api.upload.resumeUpload({
          versionId: version.id,
        });
        setStarting(false);
        await run(file, resumed.version, resumed.upload, resumed.uploadedParts);
      } catch {
        setStarting(false);
        setUpload({ file, phase: "failed", progress: 0, version });
      }
    },
    [run]
  );

  const start = useCallback(
    async (file: File) => {
      setProblem(undefined);
      if (!isVideoType(file.type)) {
        setProblem({ kind: "notVideo", name: file.name });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setProblem({ kind: "tooLarge", name: file.name });
        return;
      }
      setStarting(true);
      try {
        const created = await api.upload.createUpload({
          contentType: file.type,
          deliverableId: deliverable.id,
          fileName: file.name,
          sizeBytes: file.size,
        });
        setStarting(false);
        await run(file, created.version, created.upload, []);
      } catch (error) {
        setStarting(false);
        setProblem({ kind: isConflict(error) ? "conflict" : "startError" });
        await refresh();
      }
    },
    [deliverable.id, refresh, run]
  );

  const cancel = useCallback(
    async (version: Version) => {
      controller.current?.abort();
      setProblem(undefined);
      try {
        await api.upload.abort({ versionId: version.id });
        setUpload(undefined);
        toast.success(messages.cancelled);
      } catch {
        setProblem({ kind: "cancelError" });
      }
      await refresh();
    },
    [messages.cancelled, refresh]
  );

  // An upload left unfinished, e.g. by a reload: the browser lost the file,
  // so it has to be selected again before resuming.
  const interrupted =
    upload?.phase === "uploading" || upload?.phase === "failed"
      ? undefined
      : versions.data?.find((item) => item.status === "uploading");

  const resumeInterrupted = useCallback(
    (file: File) => {
      if (!interrupted) {
        return;
      }
      if (
        file.name !== interrupted.fileName ||
        file.size !== interrupted.sizeBytes
      ) {
        setProblem({
          kind: "mismatch",
          name: interrupted.fileName,
          size: interrupted.sizeBytes,
        });
        return;
      }
      resume(file, interrupted);
    },
    [interrupted, resume]
  );
  const cancelInterrupted = useCallback(() => {
    if (interrupted) {
      cancel(interrupted);
    }
  }, [cancel, interrupted]);
  const cancelCurrent = useCallback(() => {
    if (upload && upload.phase !== "done") {
      cancel(upload.version);
    }
  }, [cancel, upload]);
  const resumeCurrent = useCallback(() => {
    if (upload?.phase === "failed") {
      resume(upload.file, upload.version);
    }
  }, [resume, upload]);

  const inFlight =
    upload?.phase === "uploading" || upload?.phase === "failed"
      ? upload
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
      {inFlight ? (
        <UploadRow
          locale={locale}
          messages={messages}
          onCancel={cancelCurrent}
          onResume={resumeCurrent}
          upload={inFlight}
        />
      ) : null}
      {interrupted ? (
        <InterruptedRow
          locale={locale}
          messages={messages}
          onCancel={cancelInterrupted}
          onFile={resumeInterrupted}
          version={interrupted}
        />
      ) : null}
      {inFlight || interrupted ? null : (
        <Dropzone
          disabled={starting || !versions.data}
          locale={locale}
          messages={messages}
          onFile={start}
        />
      )}
      {upload?.phase === "done" ? (
        <Alert role="status" variant="success">
          <CheckIcon aria-hidden="true" />
          <AlertTitle>
            {formatMessage(messages.uploaded, {
              number: upload.version.number,
            })}
          </AlertTitle>
        </Alert>
      ) : null}
      {problem ? (
        <ProblemAlert locale={locale} messages={messages} problem={problem} />
      ) : null}
      <section aria-labelledby="versions-title" className="flex flex-col gap-3">
        <h3 className="font-medium text-sm" id="versions-title">
          {messages.list}
        </h3>
        <VersionList locale={locale} messages={messages} query={versions} />
      </section>
    </div>
  );
}

export function VersionUploadSheet({
  deliverable,
  locale,
  messages,
  onOpenChange,
}: {
  deliverable: UploadTarget | undefined;
  locale: Locale;
  messages: ProjectsMessages;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { versions } = messages;
  // The panel stays open while a file is being sent: cancel it first.
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open || !busy) {
        onOpenChange(open);
      }
    },
    [busy, onOpenChange]
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Sheet onOpenChange={handleOpenChange} open={Boolean(deliverable)}>
      <SheetContent
        className="w-full gap-0 sm:max-w-md"
        showCloseButton={false}
      >
        {deliverable ? (
          <>
            <SheetHeader className="gap-1 border-b px-5 py-4 pr-12">
              <SheetTitle className="truncate text-base">
                {formatMessage(versions.title, { title: deliverable.title })}
              </SheetTitle>
              <SheetDescription>{versions.description}</SheetDescription>
            </SheetHeader>
            <VersionUploadPanel
              deliverable={deliverable}
              key={deliverable.id}
              locale={locale}
              messages={versions}
              onBusyChange={setBusy}
            />
          </>
        ) : null}
        <Button
          className="absolute top-3 right-3"
          disabled={busy}
          onClick={close}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
          <span className="sr-only">{versions.close}</span>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
