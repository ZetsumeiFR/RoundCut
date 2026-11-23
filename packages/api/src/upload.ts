import { PLAN_LIMITS } from "@roundcut/db/plan";
import z from "zod";

import { FRAME_RATES } from "./timecode";

// Upload plan shared by the API and the browser (VER-01). Files up to the
// threshold go in one presigned PUT; larger ones in fixed-size parts that can
// be resumed. Accepted formats and per-plan size limits are VER-02.
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
export const PART_SIZE_BYTES = 16 * 1024 * 1024;
// The largest plan limit; the workspace's own plan narrows it.
export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(PLAN_LIMITS).map((limits) => limits.maxFileBytes)
);
export const MAX_SIGNED_PARTS = 20;
export const UPLOAD_FILE_NAME_MAX_LENGTH = 255;

export const partCount = (sizeBytes: number) =>
  Math.ceil(sizeBytes / PART_SIZE_BYTES);

// The extension decides the format and the stored content type: browsers
// leave File.type empty for some .mov files.
export const UPLOAD_FORMATS = {
  mov: "video/quicktime",
  mp4: "video/mp4",
} as const;

export type UploadFormat = keyof typeof UPLOAD_FORMATS;

export const UPLOAD_ACCEPT = ".mp4,.mov,video/mp4,video/quicktime";

// The browser draws the thumbnail from the first useful frame (VER-06) and
// stores it as a JPEG beside the video.
export const THUMBNAIL_CONTENT_TYPE = "image/jpeg";
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

const KEY_EXTENSION = /\.[^./]+$/;

export const thumbnailKeyOf = (r2Key: string) =>
  r2Key.replace(KEY_EXTENSION, ".jpg");

const FORMAT_EXTENSION = /\.(mp4|mov)$/i;

export function uploadFormat(fileName: string): UploadFormat | undefined {
  const extension = FORMAT_EXTENSION.exec(fileName)?.[1]?.toLowerCase();
  return extension === "mp4" || extension === "mov" ? extension : undefined;
}

export const createUploadSchema = z.object({
  deliverableId: z.string().min(1),
  fileName: z.string().trim().min(1).max(UPLOAD_FILE_NAME_MAX_LENGTH),
  // Declared by the editor (VER-03), prefilled from the detected rate.
  frameRate: z.literal(FRAME_RATES),
  sizeBytes: z.int().min(1).max(MAX_UPLOAD_BYTES),
});

export type CreateUploadInput = z.input<typeof createUploadSchema>;

export const signPartsSchema = z.object({
  partNumbers: z.array(z.int().min(1)).min(1).max(MAX_SIGNED_PARTS),
  versionId: z.string().min(1),
});
