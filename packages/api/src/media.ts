// Reads the codecs (VER-02) and the duration, resolution and frame rate
// (VER-03) of an MP4 / MOV file (ISO base media file format) without decoding
// it. Shared by the browser, which reads the picked File, and the API, which
// reads the stored object through ranged requests: only the box headers and
// the "moov" box are fetched, never the media data.

export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>;

export interface MediaTracks {
  audio: string[];
  video: string[];
}

export interface VideoInfo {
  durationMs: number;
  // Average frames per second measured from the sample table, e.g. 23.976;
  // null when the track has no samples.
  frameRate: number | null;
  // Displayed size: a rotated (portrait phone) clip reports 1080 x 1920.
  height: number;
  width: number;
}

export interface MediaInfo {
  tracks: MediaTracks;
  // The first video track; null when the file has none.
  video: VideoInfo | null;
}

const BOX_HEADER = 8;
const LARGE_BOX_HEADER = 16;
const MAX_TOP_LEVEL_BOXES = 64;
// moov of a two-hour edit is a few MB; anything far larger isn't one.
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const FULL_BOX_HEADER = 4;
const HANDLER_OFFSET = FULL_BOX_HEADER + 4;
const STSD_ENTRIES_OFFSET = FULL_BOX_HEADER + 4;
const H264_TYPES = new Set(["avc1", "avc3"]);
const AAC_OBJECT_TYPES = new Set([0x40, 0x66, 0x67, 0x68]);
const DECODER_CONFIG_TAG = 0x04;
const ES_DESCRIPTOR_TAG = 0x03;
const MS_PER_SECOND = 1000;
// mvhd / mdhd: version 1 stores times on 64 bits.
const HEADER_TIMESCALE_OFFSET = { 0: 12, 1: 20 } as const;
// tkhd: matrix then width and height, all 16.16 fixed point.
const TKHD_MATRIX_OFFSET = { 0: 40, 1: 52 } as const;
const MATRIX_TO_WIDTH = 36;
const FIXED_ONE = 0x1_00_00;
const STTS_ENTRY_BYTES = 8;

const fourCC = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

interface Box {
  end: number;
  start: number;
  type: string;
}

// Box size: 32 bits, 1 = 64-bit size after the type, 0 = up to the end.
function boxAt(view: DataView, offset: number, limit: number): Box | null {
  if (offset + BOX_HEADER > limit) {
    return null;
  }
  const size32 = view.getUint32(offset);
  let header = BOX_HEADER;
  let size = size32;
  if (size32 === 1) {
    if (offset + LARGE_BOX_HEADER > limit) {
      return null;
    }
    size = Number(view.getBigUint64(offset + BOX_HEADER));
    header = LARGE_BOX_HEADER;
  } else if (size32 === 0) {
    size = limit - offset;
  }
  if (size < header || offset + size > limit) {
    return null;
  }
  const bytes = new Uint8Array(view.buffer, view.byteOffset);
  return {
    end: offset + size,
    start: offset + header,
    type: fourCC(bytes, offset + 4),
  };
}

function children(view: DataView, start: number, end: number) {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    const box = boxAt(view, offset, end);
    if (!box) {
      break;
    }
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

const child = (view: DataView, parent: Box, type: string) =>
  children(view, parent.start, parent.end).find((box) => box.type === type);

// Expandable descriptor length: 1 to 4 bytes, high bit = more bytes follow.
// Returns the offset of the descriptor's payload.
function skipDescriptorLength(bytes: Uint8Array, offset: number) {
  let cursor = offset;
  for (let read = 0; read < 4 && cursor < bytes.length; read += 1) {
    const more = (bytes[cursor] ?? 0) >= 128;
    cursor += 1;
    if (!more) {
      break;
    }
  }
  return cursor;
}

// mp4a only says "MPEG-4 audio": the esds DecoderConfigDescriptor tells AAC
// apart from MP3 and others through its objectTypeIndication.
function mp4aCodec(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  const esds = text.indexOf("esds");
  if (esds < 0) {
    return "mp4a";
  }
  let offset = esds + 4 + FULL_BOX_HEADER;
  if (bytes[offset] !== ES_DESCRIPTOR_TAG) {
    return "mp4a";
  }
  offset = skipDescriptorLength(bytes, offset + 1);
  // ES_ID (2 bytes), then flags: dependsOn ES_ID, URL, OCR ES_ID follow
  // when their bit (0x80, 0x40, 0x20) is set.
  const flags = bytes[offset + 2] ?? 0;
  const hasFlag = (bit: number) => Math.floor(flags / bit) % 2 === 1;
  offset += 3;
  if (hasFlag(0x80)) {
    offset += 2;
  }
  if (hasFlag(0x40)) {
    offset += 1 + (bytes[offset] ?? 0);
  }
  if (hasFlag(0x20)) {
    offset += 2;
  }
  if (bytes[offset] !== DECODER_CONFIG_TAG) {
    return "mp4a";
  }
  offset = skipDescriptorLength(bytes, offset + 1);
  return AAC_OBJECT_TYPES.has(bytes[offset] ?? 0) ? "aac" : "mp4a";
}

function sampleCodec(view: DataView, stsd: Box) {
  const entry = boxAt(view, stsd.start + STSD_ENTRIES_OFFSET, stsd.end);
  if (!entry) {
    return null;
  }
  if (H264_TYPES.has(entry.type)) {
    return "h264";
  }
  if (entry.type === "mp4a") {
    return mp4aCodec(
      new Uint8Array(view.buffer, view.byteOffset + entry.start).subarray(
        0,
        entry.end - entry.start
      )
    );
  }
  return entry.type.trim();
}

const boxVersion = (view: DataView, box: Box) =>
  view.getUint8(box.start) === 1 ? 1 : 0;

// Timescale (units per second) and duration of a mvhd or mdhd box.
function timing(view: DataView, header: Box) {
  const version = boxVersion(view, header);
  const offset = header.start + HEADER_TIMESCALE_OFFSET[version];
  return {
    duration:
      version === 1
        ? Number(view.getBigUint64(offset + 4))
        : view.getUint32(offset + 4),
    timescale: view.getUint32(offset),
  };
}

// Width and height as displayed: a 90° or 270° matrix swaps them.
function displaySize(view: DataView, tkhd: Box) {
  const matrix = tkhd.start + TKHD_MATRIX_OFFSET[boxVersion(view, tkhd)];
  const width = Math.round(
    view.getUint32(matrix + MATRIX_TO_WIDTH) / FIXED_ONE
  );
  const height = Math.round(
    view.getUint32(matrix + MATRIX_TO_WIDTH + 4) / FIXED_ONE
  );
  const rotated =
    view.getInt32(matrix) === 0 &&
    Math.abs(view.getInt32(matrix + 4)) === FIXED_ONE;
  return rotated ? { height: width, width: height } : { height, width };
}

// Samples per second from the time-to-sample table: count / total duration.
function frameRateOf(view: DataView, stts: Box, timescale: number) {
  const entries = view.getUint32(stts.start + FULL_BOX_HEADER);
  let samples = 0;
  let duration = 0;
  for (let index = 0; index < entries; index += 1) {
    const entry = stts.start + STSD_ENTRIES_OFFSET + index * STTS_ENTRY_BYTES;
    if (entry + STTS_ENTRY_BYTES > stts.end) {
      break;
    }
    const count = view.getUint32(entry);
    samples += count;
    duration += count * view.getUint32(entry + 4);
  }
  return samples > 0 && duration > 0 ? (samples * timescale) / duration : null;
}

function videoInfo(
  view: DataView,
  movie: { duration: number; timescale: number },
  trak: Box,
  mdia: Box,
  stbl: Box
): VideoInfo | null {
  const tkhd = child(view, trak, "tkhd");
  const mdhd = child(view, mdia, "mdhd");
  if (!(tkhd && mdhd)) {
    return null;
  }
  const track = timing(view, mdhd);
  // The movie duration covers edits; a track-only file falls back on mdhd.
  const { duration, timescale } =
    movie.duration > 0 && movie.timescale > 0 ? movie : track;
  const stts = child(view, stbl, "stts");
  return {
    ...displaySize(view, tkhd),
    durationMs:
      timescale > 0 ? Math.round((duration * MS_PER_SECOND) / timescale) : 0,
    frameRate:
      stts && track.timescale > 0
        ? frameRateOf(view, stts, track.timescale)
        : null,
  };
}

function mediaOf(view: DataView, moov: Box): MediaInfo {
  const tracks: MediaTracks = { audio: [], video: [] };
  let video: VideoInfo | null = null;
  const bytes = new Uint8Array(view.buffer, view.byteOffset);
  const mvhd = child(view, moov, "mvhd");
  const movie = mvhd ? timing(view, mvhd) : { duration: 0, timescale: 0 };
  for (const trak of children(view, moov.start, moov.end)) {
    if (trak.type !== "trak") {
      continue;
    }
    const mdia = child(view, trak, "mdia");
    const hdlr = mdia && child(view, mdia, "hdlr");
    const minf = mdia && child(view, mdia, "minf");
    const stbl = minf && child(view, minf, "stbl");
    const stsd = stbl && child(view, stbl, "stsd");
    if (!(hdlr && stsd)) {
      continue;
    }
    const codec = sampleCodec(view, stsd);
    const handler = fourCC(bytes, hdlr.start + HANDLER_OFFSET);
    if (codec && handler === "vide") {
      tracks.video.push(codec);
      video ??= videoInfo(view, movie, trak, mdia, stbl);
    } else if (codec && handler === "soun") {
      tracks.audio.push(codec);
    }
  }
  return { tracks, video };
}

// Walks the top-level boxes up to "moov" and reads its tracks.
// Null when the file isn't an MP4 / MOV or has no readable "moov".
export async function readMedia(
  read: ReadBytes,
  size: number,
  offset = 0,
  visited = 0
): Promise<MediaInfo | null> {
  const length = Math.min(LARGE_BOX_HEADER, size - offset);
  if (length < BOX_HEADER || visited >= MAX_TOP_LEVEL_BOXES) {
    return null;
  }
  const header = await read(offset, length);
  const box = boxAt(
    new DataView(header.buffer, header.byteOffset, header.byteLength),
    0,
    size - offset
  );
  if (!box) {
    return null;
  }
  if (box.type !== "moov") {
    return readMedia(read, size, offset + box.end, visited + 1);
  }
  if (box.end > MAX_MOOV_BYTES) {
    return null;
  }
  const moov = await read(offset, box.end);
  return mediaOf(
    new DataView(moov.buffer, moov.byteOffset, moov.byteLength),
    box
  );
}

// MP4: H.264 video with AAC audio (or none); MOV: H.264 video, any audio.
export function isSupportedMedia(
  format: "mov" | "mp4",
  tracks: MediaTracks
): boolean {
  const videoOk =
    tracks.video.length > 0 && tracks.video.every((codec) => codec === "h264");
  const audioOk =
    format === "mov" || tracks.audio.every((codec) => codec === "aac");
  return videoOk && audioOk;
}
