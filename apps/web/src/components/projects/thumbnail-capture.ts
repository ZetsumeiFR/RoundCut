import { THUMBNAIL_CONTENT_TYPE } from "@roundcut/api/upload";

// Draws a version's thumbnail in the browser (VER-06). Videos often open on
// black or a flat slate, so frames are sampled from the start until one has
// enough light and detail: the first useful frame.

const THUMBNAIL_WIDTH = 640;
const JPEG_QUALITY = 0.82;
const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 18;
// Mean and standard deviation of the luma (0-255) a useful frame reaches.
const MIN_LUMA = 24;
const MIN_CONTRAST = 12;
const SAMPLE_SECONDS = [0, 0.5, 1, 2, 3, 5, 8, 12, 20, 30];
const STEP_TIMEOUT_MS = 5000;
const LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
const RGBA = 4;

function waitFor(video: HTMLVideoElement, event: "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", fail);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`The video couldn't be decoded (${event})`));
    };
    const timer = setTimeout(fail, STEP_TIMEOUT_MS);
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

function measure(sample: CanvasRenderingContext2D, frame: HTMLCanvasElement) {
  sample.drawImage(frame, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const { data } = sample.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const lumas: number[] = [];
  for (let index = 0; index < data.length; index += RGBA) {
    const [red, green, blue] = LUMA_WEIGHTS;
    lumas.push(
      red * (data[index] ?? 0) +
        green * (data[index + 1] ?? 0) +
        blue * (data[index + 2] ?? 0)
    );
  }
  const mean = lumas.reduce((total, luma) => total + luma, 0) / lumas.length;
  const variance =
    lumas.reduce((total, luma) => total + (luma - mean) ** 2, 0) / lumas.length;
  return { contrast: Math.sqrt(variance), luma: mean };
}

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, THUMBNAIL_CONTENT_TYPE, JPEG_QUALITY)
  );

// Resolves to null when the browser can't decode the file: the version is
// then published without a thumbnail and shown with an icon.
export async function captureThumbnail(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const loaded = waitFor(video, "loadeddata");
    video.src = url;
    await loaded;
    const width = Math.min(video.videoWidth, THUMBNAIL_WIDTH);
    const height = Math.round((video.videoHeight / video.videoWidth) * width);
    const frame = document.createElement("canvas");
    frame.width = width;
    frame.height = height;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = SAMPLE_WIDTH;
    sampleCanvas.height = SAMPLE_HEIGHT;
    const context = frame.getContext("2d");
    const sample = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!(context && sample && width > 0 && height > 0)) {
      return null;
    }
    const draw = async (seconds: number) => {
      const seeked = waitFor(video, "seeked");
      video.currentTime = seconds;
      await seeked;
      context.drawImage(video, 0, 0, width, height);
    };
    const times = SAMPLE_SECONDS.filter(
      (seconds) => seconds === 0 || seconds < video.duration
    );
    // One video element seeks one frame at a time, in order.
    const findFrame = async (
      index: number,
      best: { contrast: number; seconds: number }
    ): Promise<Blob | null> => {
      const seconds = times[index];
      if (seconds === undefined) {
        // No frame qualifies (a dark or static video): keep the most detailed.
        await draw(best.seconds);
        return await toJpeg(frame);
      }
      await draw(seconds);
      const { contrast, luma } = measure(sample, frame);
      if (luma >= MIN_LUMA && contrast >= MIN_CONTRAST) {
        return await toJpeg(frame);
      }
      return await findFrame(
        index + 1,
        contrast > best.contrast ? { contrast, seconds } : best
      );
    };
    return await findFrame(0, { contrast: -1, seconds: 0 });
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
