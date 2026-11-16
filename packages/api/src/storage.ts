import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Object storage behind video uploads (VER-01): Cloudflare R2 in production,
// any S3-compatible server (MinIO) in development.
export interface StorageConfig {
  R2_ACCESS_KEY_ID: string;
  R2_BUCKET: string;
  R2_ENDPOINT: string;
  R2_SECRET_ACCESS_KEY: string;
}

// Presigned URLs stay short-lived (§9: at most one hour).
const URL_TTL_SECONDS = 60 * 60;

export function createStorage(config: StorageConfig) {
  const bucket = config.R2_BUCKET;
  const s3 = new S3Client({
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
    endpoint: config.R2_ENDPOINT,
    // Path-style URLs work for both R2 and MinIO without wildcard DNS.
    forcePathStyle: true,
    // R2 aliases us-east-1 to its "auto" region; MinIO defaults to it.
    region: "us-east-1",
    // Default checksums would bind presigned PUTs to a CRC the browser never
    // sends, and R2 rejects some of them: only send them when required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  // Parts come back in ascending order, one page of up to 1,000 at a time.
  const listParts = async (
    key: string,
    uploadId: string,
    marker?: string
  ): Promise<{ ETag: string; PartNumber: number }[]> => {
    const page = await s3.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        PartNumberMarker: marker,
        UploadId: uploadId,
      })
    );
    const parts = (page.Parts ?? []).flatMap(({ ETag, PartNumber }) =>
      ETag && PartNumber ? [{ ETag, PartNumber }] : []
    );
    if (page.IsTruncated && page.NextPartNumberMarker) {
      return [
        ...parts,
        ...(await listParts(key, uploadId, page.NextPartNumberMarker)),
      ];
    }
    return parts;
  };

  return {
    // Gives up a multipart upload; an upload already gone counts as aborted.
    async abortMultipart(key: string, uploadId: string) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
          })
        );
      } catch (error) {
        if (!(error instanceof NoSuchUpload)) {
          throw error;
        }
      }
    },

    // Assembles the parts the browser uploaded, as storage lists them, so the
    // client never has to read part ETags (not exposed by CORS by default).
    async completeMultipart(key: string, uploadId: string) {
      const parts = await listParts(key, uploadId);
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          MultipartUpload: { Parts: parts },
          UploadId: uploadId,
        })
      );
    },

    async createMultipart(key: string, contentType: string) {
      const { UploadId } = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          ContentType: contentType,
          Key: key,
        })
      );
      if (!UploadId) {
        throw new Error("Storage returned no multipart upload id");
      }
      return UploadId;
    },

    async deleteObject(key: string) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async objectSize(key: string) {
      try {
        const head = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key })
        );
        return head.ContentLength ?? 0;
      } catch (error) {
        if (error instanceof NotFound) {
          return null;
        }
        throw error;
      }
    },

    // Reads `length` bytes from `offset`, e.g. to inspect a stored file's
    // headers without downloading it.
    async readRange(key: string, offset: number, length: number) {
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          Range: `bytes=${offset}-${offset + length - 1}`,
        })
      );
      if (!object.Body) {
        throw new Error(`Storage returned no body for ${key}`);
      }
      return await object.Body.transformToByteArray();
    },

    signGet(key: string) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        {
          expiresIn: URL_TTL_SECONDS,
        }
      );
    },

    signPart(key: string, uploadId: string, partNumber: number) {
      return getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          PartNumber: partNumber,
          UploadId: uploadId,
        }),
        { expiresIn: URL_TTL_SECONDS }
      );
    },

    signPut(key: string, contentType: string) {
      return getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          ContentType: contentType,
          Key: key,
        }),
        { expiresIn: URL_TTL_SECONDS }
      );
    },

    async uploadedParts(key: string, uploadId: string) {
      const parts = await listParts(key, uploadId);
      return parts.map((part) => part.PartNumber);
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
