"use client";

import { ORPCError } from "@orpc/client";
import {
  isSupportedMedia,
  type MediaTracks,
  readMedia,
  type VideoInfo,
} from "@roundcut/api/media";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import {
  detectFrameRate,
  FRAME_RATES,
  type FrameRate,
  formatTimecode,
} from "@roundcut/api/timecode";
import { UPLOAD_ACCEPT, uploadFormat } from "@roundcut/api/upload";
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
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@roundcut/ui/components/field";
import { Progress } from "@roundcut/ui/components/progress";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
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
import { captureThumbnail } from "./thumbnail-capture";
import { VersionThumbnail } from "./version-thumbnail";
import { sendFile, sendThumbnail, type UploadPlan } from "./version-upload";

type ProjectsMessages = Messages["projects"];
type VersionMessages = ProjectsMessages["versions"];
// What uploads carry; listed versions add their thumbnail.
type Version = Awaited<
  ReturnType<AppRouterClient["upload"]["createUpload"]>
>["version"];
// A finished upload is published: it carries the round it opened (VER-04).
type Published = Awaited<
  ReturnType<AppRouterClient["upload"]["completeUpload"]>
>;

export interface UploadTarget {
  id: string;
  title: string;
}

// A checked file waiting for its frame rate to be confirmed (VER-03).
interface Picked {
  file: File;
  frameRate: FrameRate | null;
  // Drawn as soon as the file is picked (VER-06); null when it can't be.
  thumbnail: Blob | null;
  video: VideoInfo;
}

type Upload =
  | { file: File; phase: "uploading"; progress: number; version: Version }
  | { file: File; phase: "failed"; progress: number; version: Version }
  | { phase: "done"; version: Published };

type Problem =
  | { kind: "format"; name: string }
  | { codecs: string; kind: "codec"; name: string }
  | { kind: "tooLarge"; max: number; name: string }
  | { kind: "conflict" | "startError" | "cancelError" }
  | { kind: "mismatch"; name: string; size: number };

const CODEC_NAMES: Record<string, string> = {
  aac: "AAC",
  ap4h: "Apple ProRes 4444",
  ap4x: "Apple ProRes 4444 XQ",
  apch: "Apple ProRes 422 HQ",
  apcn: "Apple ProRes 422",
  apco: "Apple ProRes 422 Proxy",
  apcs: "Apple ProRes 422 LT",
  av01: "AV1",
  h264: "H.264",
  hev1: "HEVC (H.265)",
  hvc1: "HEVC (H.265)",
  mp4a: "MP3",
  vp09: "VP9",
};

// Names the codecs that keep a file out, e.g. "HEVC (H.265)". MOV files
// accept any audio; a file without a video track is just not a video.
function codecProblem(name: string, tracks: MediaTracks): Problem {
  const refused = [
    ...tracks.video.filter((codec) => codec !== "h264"),
    ...(uploadFormat(name) === "mov"
      ? []
      : tracks.audio.filter((codec) => codec !== "aac")),
  ];
  if (tracks.video.length === 0 || refused.length === 0) {
    return { kind: "format", name };
  }
  const names = refused.map((codec) => CODEC_NAMES[codec] ?? codec);
  return { codecs: [...new Set(names)].join(", "), kind: "codec", name };
}

const readFile = (file: File) => async (offset: number, length: number) =>
  new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

// Checks the format and codecs (VER-02) and reads the duration, resolution
// and frame rate (VER-03) before anything is sent.
async function inspectFile(
  file: File,
  maxBytes: number
): Promise<{ problem: Problem } | { video: VideoInfo }> {
  const format = uploadFormat(file.name);
  if (!format) {
    return { problem: { kind: "format", name: file.name } };
  }
  if (file.size > maxBytes) {
    return { problem: { kind: "tooLarge", max: maxBytes, name: file.name } };
  }
  const media = await readMedia(readFile(file), file.size);
  if (!media?.video) {
    return { problem: { kind: "format", name: file.name } };
  }
  if (!isSupportedMedia(format, media.tracks)) {
    return { problem: codecProblem(file.name, media.tracks) };
  }
  return { video: media.video };
}

const errorCode = (error: unknown) =>
  error instanceof ORPCError ? String(error.code) : undefined;

// Refusals reported by the API when a file got past the browser's checks.
function refusalOf(error: unknown, name: string): Problem | undefined {
  if (!(error instanceof ORPCError)) {
    return;
  }
  if (error.code === "PAYLOAD_TOO_LARGE") {
    const { maxBytes } = error.data as { maxBytes: number };
    return { kind: "tooLarge", max: maxBytes, name };
  }
  if (error.code === "UNSUPPORTED_MEDIA_TYPE") {
    const { tracks } = error.data as { tracks: MediaTracks | null };
    return tracks ? codecProblem(name, tracks) : { kind: "format", name };
  }
}

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

// HH:MM:SS:FF once the frame rate is known, seconds until then.
function formatDuration(
  durationMs: number,
  frameRate: FrameRate | null,
  locale: Locale
) {
  if (frameRate) {
    return formatTimecode(durationMs, frameRate);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "second",
  }).format(durationMs / MS_PER_SECOND);
}

const MS_PER_SECOND = 1000;

function describeProblem(
  problem: Problem,
  messages: VersionMessages,
  locale: Locale
): { description?: string; proxyHelp?: boolean; title: string } {
  switch (problem.kind) {
    case "format":
      return {
        description: messages.accepted,
        proxyHelp: true,
        title: formatMessage(messages.format, { name: problem.name }),
      };
    case "codec":
      return {
        description: messages.accepted,
        proxyHelp: true,
        title: formatMessage(messages.codec, {
          codecs: problem.codecs,
          name: problem.name,
        }),
      };
    case "tooLarge":
      return {
        description: formatMessage(messages.tooLarge.description, {
          max: formatBytes(problem.max, locale),
        }),
        proxyHelp: true,
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
  const { description, proxyHelp, title } = describeProblem(
    problem,
    messages,
    locale
  );
  return (
    <Alert role="alert" variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle className="line-clamp-none break-words">{title}</AlertTitle>
      {description || proxyHelp ? (
        <AlertDescription className="flex flex-col gap-2">
          {description ? <p>{description}</p> : null}
          {proxyHelp ? <ProxyHelp messages={messages.proxy} /> : null}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

const PROXY_STEPS = ["premiere", "resolve", "finalCut"] as const;

function ProxyHelp({ messages }: { messages: VersionMessages["proxy"] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{messages.title}</p>
      <ul className="flex list-disc flex-col gap-1 pl-4">
        {PROXY_STEPS.map((step) => (
          <li key={step}>{messages[step]}</li>
        ))}
      </ul>
      <p>{messages.tip}</p>
    </div>
  );
}

function Dropzone({
  disabled,
  locale,
  maxBytes,
  messages,
  onFile,
}: {
  disabled: boolean;
  locale: Locale;
  maxBytes: number | undefined;
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
        accept={UPLOAD_ACCEPT}
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
          {maxBytes === undefined
            ? messages.formatsLoading
            : formatMessage(messages.formats, {
                max: formatBytes(maxBytes, locale),
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
        accept={UPLOAD_ACCEPT}
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

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

function PickedFile({
  locale,
  messages,
  onFrameRate,
  onRemove,
  onSend,
  picked,
  sending,
}: {
  locale: Locale;
  messages: VersionMessages;
  onFrameRate: (frameRate: FrameRate) => void;
  onRemove: () => void;
  onSend: () => void;
  picked: Picked;
  sending: boolean;
}) {
  const selectId = useId();
  const { file, frameRate, thumbnail, video } = picked;
  const preview = useObjectUrl(thumbnail);
  const measured = video.frameRate;
  const detected = detectFrameRate(measured);
  const rateLabel = (rate: number) =>
    formatMessage(messages.frameRate.option, {
      rate: new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(
        rate
      ),
    });
  const handleValueChange = useCallback(
    (next: string | null) => {
      const rate = FRAME_RATES.find((item) => String(item) === next);
      if (rate) {
        onFrameRate(rate);
      }
    },
    [onFrameRate]
  );
  let hint = messages.frameRate.undetected;
  if (detected) {
    hint = messages.frameRate.detected;
  } else if (measured !== null) {
    hint = formatMessage(messages.frameRate.unusual, {
      rate: rateLabel(measured),
    });
  }
  return (
    <div className="flex flex-col gap-4">
      <Attachment className="w-full" state="idle">
        <AttachmentMedia variant={preview ? "image" : "icon"}>
          <VersionThumbnail
            alt={formatMessage(messages.thumbnail.alt, { name: file.name })}
            fallback={<FileVideoIcon aria-hidden="true" />}
            src={preview}
          />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{file.name}</AttachmentTitle>
          <AttachmentDescription className="whitespace-normal">
            {formatDuration(video.durationMs, frameRate, locale)} ·{" "}
            {formatMessage(messages.resolution, {
              height: video.height,
              width: video.width,
            })}{" "}
            · {formatBytes(file.size, locale)}
          </AttachmentDescription>
          <AttachmentDescription className="whitespace-normal">
            {thumbnail ? messages.thumbnail.taken : messages.thumbnail.missing}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            aria-label={formatMessage(messages.remove, { name: file.name })}
            disabled={sending}
            onClick={onRemove}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Field data-invalid={frameRate === null || undefined}>
        <FieldLabel htmlFor={selectId}>{messages.frameRate.label}</FieldLabel>
        <Select
          onValueChange={handleValueChange}
          value={frameRate === null ? null : String(frameRate)}
        >
          <SelectTrigger
            aria-invalid={frameRate === null || undefined}
            className="w-full sm:w-52"
            id={selectId}
          >
            <SelectValue>
              {frameRate === null
                ? messages.frameRate.placeholder
                : rateLabel(frameRate)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FRAME_RATES.map((rate) => (
                <SelectItem key={rate} value={String(rate)}>
                  {rateLabel(rate)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {hint} {messages.frameRate.usage}
        </FieldDescription>
      </Field>
      <Button
        className="self-start"
        disabled={frameRate === null || sending}
        onClick={onSend}
        type="button"
      >
        {sending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <UploadIcon aria-hidden="true" data-icon="inline-start" />
        )}
        {messages.send}
      </Button>
    </div>
  );
}

// "00:00:03:00 · 1920 × 1080 · 25 fps"; versions uploaded before VER-03 have
// no metadata and show none.
function versionDetails(
  item: Version,
  messages: VersionMessages,
  locale: Locale
) {
  const { durationMs, frameRate, height, width } = item;
  return [
    durationMs === null ? null : formatDuration(durationMs, frameRate, locale),
    width && height
      ? formatMessage(messages.resolution, { height, width })
      : null,
    frameRate
      ? formatMessage(messages.frameRate.option, { rate: frameRate })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
      {finished.map((item) => {
        const details = versionDetails(item, messages, locale);
        return (
          <li key={item.id}>
            <Attachment className="w-full" state="done">
              <AttachmentMedia variant={item.thumbnailUrl ? "image" : "icon"}>
                <VersionThumbnail
                  alt=""
                  fallback={<CheckIcon aria-hidden="true" />}
                  src={item.thumbnailUrl}
                />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>
                  {formatMessage(messages.version, { number: item.number })} ·{" "}
                  {item.fileName}
                </AttachmentTitle>
                {details ? (
                  <AttachmentDescription className="whitespace-normal">
                    {details}
                  </AttachmentDescription>
                ) : null}
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
        );
      })}
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
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const maxBytes = workspace.data?.maxUploadBytes;
  const [upload, setUpload] = useState<Upload | undefined>();
  const [problem, setProblem] = useState<Problem | undefined>();
  const [picked, setPicked] = useState<Picked | undefined>();
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
        queryClient.invalidateQueries({ queryKey: orpc.round.key() }),
      ]),
    [queryClient]
  );

  const run = useCallback(
    async (
      file: File,
      version: Version,
      plan: UploadPlan,
      uploadedParts: number[],
      thumbnail?: Blob | null
    ) => {
      const abort = new AbortController();
      controller.current = abort;
      setUpload({ file, phase: "uploading", progress: 0, version });
      // Sent alongside the video; a resumed upload draws it again. Without
      // a thumbnail the version still publishes and shows an icon.
      const thumbnailSent = (
        thumbnail === undefined
          ? captureThumbnail(file)
          : Promise.resolve(thumbnail)
      )
        .then((blob) => blob && sendThumbnail(blob, version.id, abort.signal))
        .catch(() => undefined);
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
        await thumbnailSent;
        const ready = await api.upload.completeUpload({
          versionId: version.id,
        });
        setUpload({ phase: "done", version: ready });
        toast.success(
          formatMessage(messages.uploadedToast, {
            number: ready.number,
            round: ready.round.position,
            title: deliverable.title,
          })
        );
        await refresh();
      } catch (error) {
        if (abort.signal.aborted) {
          return;
        }
        // The API removed a file it refused: there's nothing left to resume.
        const refusal = refusalOf(error, file.name);
        if (refusal) {
          setUpload(undefined);
          setProblem(refusal);
          await refresh();
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

  const pick = useCallback(
    async (file: File) => {
      if (maxBytes === undefined) {
        return;
      }
      setProblem(undefined);
      setUpload(undefined);
      setStarting(true);
      try {
        const inspected = await inspectFile(file, maxBytes);
        if ("problem" in inspected) {
          setProblem(inspected.problem);
          return;
        }
        setPicked({
          file,
          frameRate: detectFrameRate(inspected.video.frameRate),
          thumbnail: await captureThumbnail(file),
          video: inspected.video,
        });
      } catch {
        setProblem({ kind: "format", name: file.name });
      } finally {
        setStarting(false);
      }
    },
    [maxBytes]
  );
  const setFrameRate = useCallback(
    (frameRate: FrameRate) =>
      setPicked((current) => current && { ...current, frameRate }),
    []
  );
  const removePicked = useCallback(() => setPicked(undefined), []);

  const start = useCallback(async () => {
    if (!picked?.frameRate) {
      return;
    }
    const { file, frameRate, thumbnail } = picked;
    setProblem(undefined);
    setStarting(true);
    try {
      const created = await api.upload.createUpload({
        deliverableId: deliverable.id,
        fileName: file.name,
        frameRate,
        sizeBytes: file.size,
      });
      setStarting(false);
      setPicked(undefined);
      await run(file, created.version, created.upload, [], thumbnail);
    } catch (error) {
      setStarting(false);
      setProblem(
        refusalOf(error, file.name) ?? {
          kind: errorCode(error) === "CONFLICT" ? "conflict" : "startError",
        }
      );
      await refresh();
    }
  }, [deliverable.id, picked, refresh, run]);

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
      {picked && !inFlight && !interrupted ? (
        <PickedFile
          locale={locale}
          messages={messages}
          onFrameRate={setFrameRate}
          onRemove={removePicked}
          onSend={start}
          picked={picked}
          sending={starting}
        />
      ) : null}
      {inFlight || interrupted || picked ? null : (
        <Dropzone
          disabled={starting || !versions.data || maxBytes === undefined}
          locale={locale}
          maxBytes={maxBytes}
          messages={messages}
          onFile={pick}
        />
      )}
      {upload?.phase === "done" ? (
        <Alert role="status" variant="success">
          <CheckIcon aria-hidden="true" />
          <AlertTitle>
            {formatMessage(messages.uploaded, {
              number: upload.version.number,
              round: upload.version.round.position,
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
