import type { AppRouterClient } from "@roundcut/api/routers/index";
import { MAX_SIGNED_PARTS, THUMBNAIL_CONTENT_TYPE } from "@roundcut/api/upload";

import { client as api } from "@/utils/orpc";

// Sends a file straight from the browser to object storage (VER-01) through
// the presigned URLs the API hands out. XMLHttpRequest rather than fetch:
// only XHR reports upload progress.

export type UploadPlan = Awaited<
  ReturnType<AppRouterClient["upload"]["createUpload"]>
>["upload"];

const PARALLEL_PARTS = 3;
const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;

function putBlob(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
  contentType?: string
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const settle = (error?: unknown) => {
      signal.removeEventListener("abort", abort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    xhr.upload.addEventListener("progress", (event) =>
      onProgress(event.loaded)
    );
    xhr.addEventListener("load", () => {
      if (xhr.status >= SUCCESS_MIN && xhr.status <= SUCCESS_MAX) {
        onProgress(body.size);
        settle();
      } else {
        settle(new Error(`Storage answered ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () =>
      settle(new Error("Network error during upload"))
    );
    xhr.addEventListener("abort", () => settle(signal.reason));
    xhr.open("PUT", url);
    if (contentType) {
      xhr.setRequestHeader("Content-Type", contentType);
    }
    xhr.send(body);
  });
}

async function uploadParts({
  file,
  onProgress,
  plan,
  signal,
  uploadedParts,
  versionId,
}: {
  file: File;
  onProgress: (ratio: number) => void;
  plan: Extract<UploadPlan, { kind: "multipart" }>;
  signal: AbortSignal;
  uploadedParts: number[];
  versionId: string;
}) {
  const { partCount, partSize } = plan;
  const partBytes = (partNumber: number) =>
    Math.min(partNumber * partSize, file.size) - (partNumber - 1) * partSize;
  const stored = new Set(uploadedParts);
  const queue = Array.from(
    { length: partCount },
    (_, index) => index + 1
  ).filter((partNumber) => !stored.has(partNumber));
  const inFlight = new Map<number, number>();
  let storedBytes = uploadedParts.reduce(
    (total, partNumber) => total + partBytes(partNumber),
    0
  );
  const report = () => {
    let sending = 0;
    for (const loaded of inFlight.values()) {
      sending += loaded;
    }
    onProgress((storedBytes + sending) / file.size);
  };

  // URLs are signed by batches: the part asked for plus the next ones queued.
  const urls = new Map<number, Promise<string>>();
  const signedUrl = (partNumber: number) => {
    const known = urls.get(partNumber);
    if (known) {
      return known;
    }
    const batch = [
      partNumber,
      ...queue.filter((queued) => !urls.has(queued)),
    ].slice(0, MAX_SIGNED_PARTS);
    const signed = api.upload.signParts({ partNumbers: batch, versionId });
    for (const queued of batch) {
      urls.set(
        queued,
        signed.then((parts) => {
          const part = parts.find((item) => item.partNumber === queued);
          if (!part) {
            throw new Error(`Part ${queued} was not signed`);
          }
          return part.url;
        })
      );
    }
    return signedUrl(partNumber);
  };

  // One failed part stops the others: the stored parts are kept for resuming.
  const stop = new AbortController();
  const stopAll = () => stop.abort(signal.reason);
  signal.addEventListener("abort", stopAll, { once: true });
  const sendNext = async (): Promise<void> => {
    const partNumber = queue.shift();
    if (partNumber === undefined) {
      return;
    }
    stop.signal.throwIfAborted();
    const start = (partNumber - 1) * partSize;
    await putBlob(
      await signedUrl(partNumber),
      file.slice(start, start + partBytes(partNumber)),
      stop.signal,
      (loaded) => {
        inFlight.set(partNumber, loaded);
        report();
      }
    );
    inFlight.delete(partNumber);
    storedBytes += partBytes(partNumber);
    report();
    return sendNext();
  };

  report();
  try {
    await Promise.all(
      Array.from({ length: PARALLEL_PARTS }, async () => {
        try {
          await sendNext();
        } catch (error) {
          stop.abort(error);
          throw error;
        }
      })
    );
  } finally {
    signal.removeEventListener("abort", stopAll);
  }
}

// Stores the thumbnail drawn in the browser beside the video (VER-06).
export async function sendThumbnail(
  thumbnail: Blob,
  versionId: string,
  signal: AbortSignal
) {
  const { url } = await api.upload.signThumbnail({ versionId });
  await putBlob(
    url,
    thumbnail,
    signal,
    () => undefined,
    THUMBNAIL_CONTENT_TYPE
  );
}

export function sendFile({
  file,
  onProgress,
  plan,
  signal,
  uploadedParts,
  versionId,
}: {
  file: File;
  onProgress: (ratio: number) => void;
  plan: UploadPlan;
  signal: AbortSignal;
  uploadedParts: number[];
  versionId: string;
}) {
  if (plan.kind === "single") {
    return putBlob(
      plan.url,
      file,
      signal,
      (loaded) => onProgress(loaded / file.size),
      file.type
    );
  }
  return uploadParts({
    file,
    onProgress,
    plan,
    signal,
    uploadedParts,
    versionId,
  });
}
