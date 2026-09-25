// A deterministic ZIP writer. Entries are stored, not deflated, so the bytes depend only on
// the file names and contents: no compressor version, no clock. Every entry carries the
// same fixed timestamp. The archive is the downloadable form of the agent plugin.

const encoder = new TextEncoder();

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

/** CRC-32 as ZIP requires it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 2026-01-01 00:00:00 in MS-DOS date and time fields. Fixed so regeneration is byte-stable. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

/** Build a ZIP archive with stored entries in the order given. */
export function zip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const view = new DataView(local.buffer);
    u32(view, 0, 0x04034b50);
    u16(view, 4, 20);
    u16(view, 6, 0x0800);
    u16(view, 8, 0);
    u16(view, 10, DOS_TIME);
    u16(view, 12, DOS_DATE);
    u32(view, 14, crc);
    u32(view, 18, entry.bytes.length);
    u32(view, 22, entry.bytes.length);
    u16(view, 26, name.length);
    u16(view, 28, 0);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 8, 0x0800);
    u16(centralView, 10, 0);
    u16(centralView, 12, DOS_TIME);
    u16(centralView, 14, DOS_DATE);
    u32(centralView, 16, crc);
    u32(centralView, 20, entry.bytes.length);
    u32(centralView, 24, entry.bytes.length);
    u16(centralView, 28, name.length);
    u16(centralView, 30, 0);
    u16(centralView, 32, 0);
    u16(centralView, 34, 0);
    u16(centralView, 36, 0);
    u32(centralView, 38, 0);
    u32(centralView, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce(
    (sum, central) => sum + central.length,
    0,
  );
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 4, 0);
  u16(endView, 6, 0);
  u16(endView, 8, entries.length);
  u16(endView, 10, entries.length);
  u32(endView, 12, directorySize);
  u32(endView, 16, offset);
  u16(endView, 20, 0);
  return concat([...locals, ...centrals, end]);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}
