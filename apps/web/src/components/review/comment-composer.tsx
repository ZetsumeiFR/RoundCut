"use client";

import {
  COMMENT_ATTACHMENT_ACCEPT,
  COMMENT_ATTACHMENT_MAX_BYTES,
  COMMENT_BODY_MAX_LENGTH,
  isCommentAttachmentType,
} from "@roundcut/api/comment";
import {
  type FrameRate,
  formatTimecode,
  parseTimecode,
} from "@roundcut/api/timecode";
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
import { Field, FieldError, FieldLabel } from "@roundcut/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@roundcut/ui/components/input-group";
import { Switch } from "@roundcut/ui/components/switch";
import { Textarea } from "@roundcut/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { CrosshairIcon, ImageIcon, ImagePlusIcon, XIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { VersionThumbnail } from "@/components/projects/version-thumbnail";
import { putBlob } from "@/components/projects/version-upload";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { FALLBACK_FRAME_RATE, type PlayerHandle } from "./video-player";

type CommentMessages = Messages["review"]["comments"];
type FieldName = "attachment" | "body" | "end" | "start";
type FieldErrors = Partial<Record<FieldName, string>>;

interface Attached {
  file: File;
  previewUrl: string;
}

const EXAMPLE_TIMECODE_MS = 83_000;
const BYTES_PER_KILOBYTE = 1000;
const BYTES_PER_MEGABYTE = 1_000_000;

interface ReadTimecode {
  error?: string;
  ms: number | null;
}

const NO_TIMECODE: ReadTimecode = { ms: null };

// A typed position, checked against the frame rate and the video's length.
function readTimecode(
  text: string,
  {
    durationMs,
    frameRate,
    messages,
  }: {
    durationMs: number | null;
    frameRate: FrameRate;
    messages: CommentMessages;
  }
): ReadTimecode {
  const ms = parseTimecode(text, frameRate);
  if (ms === null) {
    return {
      error: formatMessage(messages.timecodeInvalid, {
        example: formatTimecode(EXAMPLE_TIMECODE_MS, frameRate),
      }),
      ms,
    };
  }
  if (durationMs !== null && ms > durationMs) {
    return { error: messages.timecodeTooLate, ms: null };
  }
  return { ms };
}

function TimecodeField({
  captureLabel,
  error,
  id,
  label,
  onCapture,
  onValueChange,
  value,
}: {
  captureLabel: string;
  error: string | undefined;
  id: string;
  label: string;
  onCapture: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
    [onValueChange]
  );
  const errorId = `${id}-error`;
  return (
    <Field className="w-44 gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="font-mono tabular-nums"
          id={id}
          inputMode="numeric"
          onChange={handleChange}
          spellCheck={false}
          value={value}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={captureLabel}
            className="pointer-coarse:size-8"
            onClick={onCapture}
            size="icon-xs"
            title={captureLabel}
          >
            <CrosshairIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}

// Writing a comment on the client's review link (REV-03). The position is
// captured from the player when the reviewer starts writing (pausing the
// video) and stays editable; a range adds an end. An optional image goes
// straight to storage through a signed URL before the comment is created.
export function CommentComposer({
  durationMs,
  frameRate: declaredFrameRate,
  locale,
  messages,
  playerRef,
  token,
  versionId,
}: {
  durationMs: number | null;
  frameRate: FrameRate | null;
  locale: Locale;
  messages: CommentMessages;
  playerRef: RefObject<PlayerHandle | null>;
  token: string;
  versionId: string;
}) {
  const frameRate = declaredFrameRate ?? FALLBACK_FRAME_RATE;
  const ids = useId();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  // Once the reviewer types or captures a position themselves, focusing the
  // text no longer moves it.
  const positionChosen = useRef<boolean>(false);
  const [start, setStart] = useState(() => formatTimecode(0, frameRate));
  const [end, setEnd] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const formatSize = useMemo(() => {
    const unitFormat = (unit: "kilobyte" | "megabyte") =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        style: "unit",
        unit,
      });
    const kilobytes = unitFormat("kilobyte");
    const megabytes = unitFormat("megabyte");
    return (bytes: number) =>
      bytes < BYTES_PER_MEGABYTE
        ? kilobytes.format(Math.max(bytes / BYTES_PER_KILOBYTE, 0.1))
        : megabytes.format(bytes / BYTES_PER_MEGABYTE);
  }, [locale]);

  useEffect(
    () => () => {
      if (attached) {
        URL.revokeObjectURL(attached.previewUrl);
      }
    },
    [attached]
  );

  const clearError = useCallback(
    (name: FieldName) =>
      setErrors((current) => ({ ...current, [name]: undefined })),
    []
  );

  const currentPosition = useCallback(() => {
    const player = playerRef.current;
    player?.pause();
    return formatTimecode(player?.currentTimeMs() ?? 0, frameRate);
  }, [frameRate, playerRef]);

  const captureStart = useCallback(() => {
    positionChosen.current = true;
    setStart(currentPosition());
    clearError("start");
  }, [clearError, currentPosition]);

  const captureEnd = useCallback(() => {
    setEnd(currentPosition());
    clearError("end");
  }, [clearError, currentPosition]);

  const handleStartChange = useCallback(
    (value: string) => {
      positionChosen.current = true;
      setStart(value);
      clearError("start");
    },
    [clearError]
  );

  const handleEndChange = useCallback(
    (value: string) => {
      setEnd(value);
      clearError("end");
    },
    [clearError]
  );

  const handleRangeChange = useCallback(
    (checked: boolean) => {
      setIsRange(checked);
      clearError("end");
      if (checked && !end) {
        setEnd(currentPosition());
      }
    },
    [clearError, currentPosition, end]
  );

  const handleBodyFocus = useCallback(() => {
    if (!(positionChosen.current || body)) {
      setStart(currentPosition());
      clearError("start");
    }
  }, [body, clearError, currentPosition]);

  const handleBodyChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setBody(event.target.value);
      clearError("body");
    },
    [clearError]
  );

  const openFilePicker = useCallback(() => fileInput.current?.click(), []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Picking the same file again after removing it must fire again.
      event.target.value = "";
      if (!file) {
        return;
      }
      if (
        !isCommentAttachmentType(file.type) ||
        file.size > COMMENT_ATTACHMENT_MAX_BYTES
      ) {
        setErrors((current) => ({
          ...current,
          attachment: messages.attachmentInvalid,
        }));
        return;
      }
      clearError("attachment");
      setAttached({ file, previewUrl: URL.createObjectURL(file) });
    },
    [clearError, messages.attachmentInvalid]
  );

  const removeAttachment = useCallback(() => setAttached(null), []);

  const validate = useCallback(() => {
    const limits = { durationMs, frameRate, messages };
    const startCode = readTimecode(start, limits);
    const endCode = isRange ? readTimecode(end, limits) : NO_TIMECODE;
    const found: FieldErrors = { end: endCode.error, start: startCode.error };
    if (
      startCode.ms !== null &&
      endCode.ms !== null &&
      endCode.ms <= startCode.ms
    ) {
      found.end = messages.endBeforeStart;
    }
    const text = body.trim();
    if (!text) {
      found.body = messages.bodyRequired;
    } else if (text.length > COMMENT_BODY_MAX_LENGTH) {
      found.body = formatMessage(messages.bodyTooLong, {
        max: numberFormat.format(COMMENT_BODY_MAX_LENGTH),
      });
    }
    return { endMs: endCode.ms, found, startMs: startCode.ms, text };
  }, [
    body,
    durationMs,
    end,
    frameRate,
    isRange,
    messages,
    numberFormat,
    start,
  ]);

  const uploadAttachment = useCallback(async () => {
    if (!attached) {
      return null;
    }
    const { file } = attached;
    if (!isCommentAttachmentType(file.type)) {
      throw new Error("Unsupported attachment type");
    }
    const { key, url } = await api.comment.signAttachment({
      contentType: file.type,
      sizeBytes: file.size,
      token,
      versionId,
    });
    await putBlob(
      url,
      file,
      new AbortController().signal,
      () => undefined,
      file.type
    );
    return key;
  }, [attached, token, versionId]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const { endMs, found, startMs, text } = validate();
      setErrors((current) => ({ attachment: current.attachment, ...found }));
      if (Object.values(found).some(Boolean) || startMs === null) {
        return;
      }
      setSubmitting(true);
      try {
        await api.comment.create({
          attachmentKey: await uploadAttachment(),
          body: text,
          endTimecodeMs: endMs,
          timecodeMs: startMs,
          token,
          versionId,
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.comment.listForReview.key(),
          }),
          queryClient.invalidateQueries({ queryKey: orpc.review.round.key() }),
        ]);
        toast.success(messages.saved);
        positionChosen.current = false;
        setBody("");
        setEnd("");
        setIsRange(false);
        setAttached(null);
      } catch {
        toast.error(messages.error);
      } finally {
        setSubmitting(false);
      }
    },
    [
      messages.error,
      messages.saved,
      queryClient,
      token,
      uploadAttachment,
      validate,
      versionId,
    ]
  );

  const bodyId = `${ids}-body`;
  const rangeId = `${ids}-range`;
  return (
    <form
      className="flex flex-col gap-3 border p-3"
      noValidate
      onSubmit={handleSubmit}
    >
      <h2 className="font-medium text-sm">{messages.title}</h2>
      <div className="flex flex-wrap items-start gap-3">
        <TimecodeField
          captureLabel={messages.capture}
          error={errors.start}
          id={`${ids}-start`}
          label={isRange ? messages.rangeStart : messages.start}
          onCapture={captureStart}
          onValueChange={handleStartChange}
          value={start}
        />
        {isRange ? (
          <TimecodeField
            captureLabel={messages.capture}
            error={errors.end}
            id={`${ids}-end`}
            label={messages.end}
            onCapture={captureEnd}
            onValueChange={handleEndChange}
            value={end}
          />
        ) : null}
        <Field className="w-auto self-center pt-5" orientation="horizontal">
          <Switch
            aria-label={messages.range}
            checked={isRange}
            id={rangeId}
            onCheckedChange={handleRangeChange}
          />
          <FieldLabel htmlFor={rangeId}>{messages.range}</FieldLabel>
        </Field>
      </div>
      <Field className="gap-1.5">
        <FieldLabel htmlFor={bodyId}>{messages.body}</FieldLabel>
        <Textarea
          aria-describedby={errors.body ? `${bodyId}-error` : undefined}
          aria-invalid={errors.body ? true : undefined}
          className="min-h-20 text-sm md:text-sm"
          id={bodyId}
          maxLength={COMMENT_BODY_MAX_LENGTH}
          onChange={handleBodyChange}
          onFocus={handleBodyFocus}
          placeholder={messages.bodyPlaceholder}
          value={body}
        />
        <div className="flex items-start gap-2">
          {errors.body ? (
            <FieldError id={`${bodyId}-error`}>{errors.body}</FieldError>
          ) : null}
          <p className="ms-auto shrink-0 text-muted-foreground text-xs tabular-nums">
            {formatMessage(messages.counter, {
              count: numberFormat.format(body.length),
              max: numberFormat.format(COMMENT_BODY_MAX_LENGTH),
            })}
          </p>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {attached ? (
          <Attachment className="min-w-0 max-w-full" size="sm">
            <AttachmentMedia variant="image">
              <VersionThumbnail
                alt=""
                className="size-full object-cover"
                fallback={<ImageIcon aria-hidden="true" />}
                src={attached.previewUrl}
              />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{attached.file.name}</AttachmentTitle>
              <AttachmentDescription>
                {formatSize(attached.file.size)}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                aria-label={messages.removeAttachment}
                onClick={removeAttachment}
                title={messages.removeAttachment}
              >
                <XIcon aria-hidden="true" />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ) : (
          <Button
            className="pointer-coarse:h-9"
            onClick={openFilePicker}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImagePlusIcon aria-hidden="true" data-icon="inline-start" />
            {messages.attach}
          </Button>
        )}
        <input
          accept={COMMENT_ATTACHMENT_ACCEPT}
          aria-label={messages.attach}
          className="sr-only"
          onChange={handleFileChange}
          ref={fileInput}
          tabIndex={-1}
          type="file"
        />
        <Button
          className="ms-auto pointer-coarse:h-9"
          disabled={submitting}
          size="sm"
          type="submit"
        >
          {submitting ? messages.submitting : messages.submit}
        </Button>
      </div>
      {errors.attachment ? <FieldError>{errors.attachment}</FieldError> : null}
    </form>
  );
}
