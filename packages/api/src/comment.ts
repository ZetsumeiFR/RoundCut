import z from "zod";

import { type FrameRate, parseTimecode } from "./timecode";

// Timestamped feedback shared by the API and the review pages (REV-03,
// REV-04). Client-safe: no node or drizzle import.
export const COMMENT_BODY_MAX_LENGTH = 2000;

export const COMMENT_REJECT_REASON_MAX_LENGTH = 500;

// Screenshots and annotated stills: the formats every browser displays.
export const COMMENT_ATTACHMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CommentAttachmentType = keyof typeof COMMENT_ATTACHMENT_TYPES;

export const COMMENT_ATTACHMENT_ACCEPT = Object.keys(
  COMMENT_ATTACHMENT_TYPES
).join(",");

export const COMMENT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const isCommentAttachmentType = (
  value: string
): value is CommentAttachmentType => value in COMMENT_ATTACHMENT_TYPES;

const timecodeMs = z.int().min(0);

export const commentSchema = z
  .object({
    attachmentKey: z.string().min(1).nullable(),
    body: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH),
    endTimecodeMs: timecodeMs.nullable(),
    timecodeMs,
    versionId: z.string().min(1),
  })
  .refine(
    (value) =>
      value.endTimecodeMs === null || value.endTimecodeMs > value.timecodeMs,
    { message: "The range must end after it starts", path: ["endTimecodeMs"] }
  );

export type CommentInput = z.input<typeof commentSchema>;

// Pasted feedback (REV-09) creates at most this many comments at once.
export const PASTED_COMMENTS_MAX = 50;

export const commentBatchSchema = z.object({
  comments: z
    .array(
      z.object({
        body: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH),
        timecodeMs,
      })
    )
    .min(1)
    .max(PASTED_COMMENTS_MAX),
  versionId: z.string().min(1),
});

export type PastedLine =
  | { body: string; kind: "comment"; line: number; timecodeMs: number }
  | {
      kind: "ignored";
      line: number;
      reason: "format" | "late" | "long";
      text: string;
    };

// A timecode first (optionally bulleted or bracketed), then a separator
// (-, –, —, :, |) or just a space, then the comment: "00:41 - musique moins
// forte", "• [01:02:03] Titre plus gros".
const LINE_BREAK = /\r?\n/u;

const PASTED_LINE_PATTERN =
  /^(?:[-*•]\s+)?\[?(\d{1,2}(?::\d{1,2}){1,3})\]?(?:\s*[-–—:|]\s*|\s+)(.+)$/u;

// Reads feedback written elsewhere (an email, a chat) line by line. Blank
// lines are skipped; every other line becomes a comment or is reported with
// why it can't be one.
export function parsePastedFeedback(
  text: string,
  { durationMs, frameRate }: { durationMs: number | null; frameRate: FrameRate }
): PastedLine[] {
  const lines: PastedLine[] = [];
  for (const [index, raw] of text.split(LINE_BREAK).entries()) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const line = index + 1;
    const match = PASTED_LINE_PATTERN.exec(trimmed);
    const position = match?.[1] ? parseTimecode(match[1], frameRate) : null;
    const body = match?.[2]?.trim() ?? "";
    if (position === null || !body) {
      lines.push({ kind: "ignored", line, reason: "format", text: trimmed });
    } else if (durationMs !== null && position > durationMs) {
      lines.push({ kind: "ignored", line, reason: "late", text: trimmed });
    } else if (body.length > COMMENT_BODY_MAX_LENGTH) {
      lines.push({ kind: "ignored", line, reason: "long", text: trimmed });
    } else {
      lines.push({ body, kind: "comment", line, timecodeMs: position });
    }
  }
  return lines;
}

// A reply joins the thread of a top-level comment (REV-04).
export const commentReplySchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH),
  parentId: z.string().min(1),
});

// Only a refusal carries a reason, and it can't be left out.
export const commentStatusSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string().min(1),
    status: z.enum(["open", "done"]),
  }),
  z.object({
    id: z.string().min(1),
    rejectReason: z
      .string()
      .trim()
      .min(1)
      .max(COMMENT_REJECT_REASON_MAX_LENGTH),
    status: z.literal("rejected"),
  }),
]);

export type CommentStatusInput = z.input<typeof commentStatusSchema>;

export const commentAttachmentSchema = z.object({
  contentType: z.enum(
    Object.keys(COMMENT_ATTACHMENT_TYPES) as [
      CommentAttachmentType,
      ...CommentAttachmentType[],
    ]
  ),
  sizeBytes: z.int().min(1).max(COMMENT_ATTACHMENT_MAX_BYTES),
  versionId: z.string().min(1),
});

// The stored bytes decide the format, whatever the browser declared: PNG and
// JPEG signatures, and a RIFF container of type WEBP.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const WEBP_TYPE_OFFSET = 8;

export const IMAGE_SIGNATURE_BYTES = 12;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

export function sniffImageType(
  bytes: Uint8Array
): CommentAttachmentType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_TYPE_OFFSET)) {
    return "image/webp";
  }
  return null;
}
