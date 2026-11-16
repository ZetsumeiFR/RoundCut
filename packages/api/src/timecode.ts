// Frame rates a version can be declared at (VER-03) and the HH:MM:SS:FF
// timecodes they drive. Client-safe: shared by the upload sheet, the player
// and timestamped feedback.
export const FRAME_RATES = [24, 25, 30, 50, 60] as const;

export type FrameRate = (typeof FRAME_RATES)[number];

// 23.976 reads as 24 and 29.97 as 30; a variable-rate phone clip averaging
// 29.8 still reads as 30. Further off (15, 48, 120…) is left to the editor.
const DETECTION_TOLERANCE = 0.015;

export function detectFrameRate(measured: number | null): FrameRate | null {
  if (measured === null) {
    return null;
  }
  return (
    FRAME_RATES.find(
      (rate) => Math.abs(measured - rate) / rate <= DETECTION_TOLERANCE
    ) ?? null
  );
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
// Absorbs float noise so 3000 ms at 25 fps is frame 75, not 74.999….
const FRAME_EPSILON = 1e-6;

const pad = (value: number) => String(value).padStart(2, "0");

// Non-drop-frame timecode of a position in milliseconds, e.g. "00:01:23:12".
export function formatTimecode(ms: number, frameRate: FrameRate) {
  const frames = Math.floor(
    (Math.max(ms, 0) * frameRate) / MS_PER_SECOND + FRAME_EPSILON
  );
  const totalSeconds = Math.floor(frames / frameRate);
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  return [
    Math.floor(totalMinutes / MINUTES_PER_HOUR),
    totalMinutes % MINUTES_PER_HOUR,
    totalSeconds % SECONDS_PER_MINUTE,
    frames % frameRate,
  ]
    .map(pad)
    .join(":");
}
