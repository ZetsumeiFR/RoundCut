import z from "zod";

// Upload plan shared by the API and the browser (VER-01). Files up to the
// threshold go in one presigned PUT; larger ones in fixed-size parts that can
// be resumed. Format and per-plan size rules come with VER-02.
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
export const PART_SIZE_BYTES = 16 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_SIGNED_PARTS = 20;
export const UPLOAD_FILE_NAME_MAX_LENGTH = 255;

export const partCount = (sizeBytes: number) =>
  Math.ceil(sizeBytes / PART_SIZE_BYTES);

export const isVideoType = (contentType: string) =>
  contentType.startsWith("video/");

export const createUploadSchema = z.object({
  contentType: z.string().refine(isVideoType),
  deliverableId: z.string().min(1),
  fileName: z.string().trim().min(1).max(UPLOAD_FILE_NAME_MAX_LENGTH),
  sizeBytes: z.int().min(1).max(MAX_UPLOAD_BYTES),
});

export type CreateUploadInput = z.input<typeof createUploadSchema>;

export const signPartsSchema = z.object({
  partNumbers: z.array(z.int().min(1)).min(1).max(MAX_SIGNED_PARTS),
  versionId: z.string().min(1),
});
