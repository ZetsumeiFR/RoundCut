// Reads the codecs of an MP4 / MOV file (ISO base media file format) without
// decoding it (VER-02). Shared by the browser, which reads the picked File,
// and the API, which reads the stored object through ranged requests: only
// the box headers and the "moov" box are fetched, never the media data.

export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>;

export interface MediaTracks {
  audio: string[];
  video: string[];
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

function tracksOf(view: DataView, moov: Box): MediaTracks {
  const tracks: MediaTracks = { audio: [], video: [] };
  const bytes = new Uint8Array(view.buffer, view.byteOffset);
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
    } else if (codec && handler === "soun") {
      tracks.audio.push(codec);
    }
  }
  return tracks;
}

// Walks the top-level boxes up to "moov" and lists its tracks' codecs.
// Null when the file isn't an MP4 / MOV or has no readable "moov".
export async function readMediaTracks(
  read: ReadBytes,
  size: number,
  offset = 0,
  visited = 0
): Promise<MediaTracks | null> {
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
    return readMediaTracks(read, size, offset + box.end, visited + 1);
  }
  if (box.end > MAX_MOOV_BYTES) {
    return null;
  }
  const moov = await read(offset, box.end);
  return tracksOf(
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
