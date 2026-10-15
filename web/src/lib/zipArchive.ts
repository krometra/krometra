export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const DEFLATE = 8;
const VERSION = 20;
const DOS_DATE_1980 = 0x21;
const MAX_UINT32 = 0xffffffff;

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = MAX_UINT32;
  for (let index = 0; index < bytes.length; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ MAX_UINT32) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface PackedEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  packed: Uint8Array;
  offset: number;
}

function header(signature: number, length: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  return { bytes, view };
}

function writeEntryFields(view: DataView, at: number, entry: PackedEntry) {
  view.setUint16(at, 0, true);
  view.setUint16(at + 2, DEFLATE, true);
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, DOS_DATE_1980, true);
  view.setUint32(at + 8, entry.crc, true);
  view.setUint32(at + 12, entry.packed.length, true);
  view.setUint32(at + 16, entry.size, true);
  view.setUint16(at + 20, entry.name.length, true);
  view.setUint16(at + 22, 0, true);
}

function localHeader(entry: PackedEntry): Uint8Array {
  const { bytes, view } = header(LOCAL_HEADER, 30 + entry.name.length);
  view.setUint16(4, VERSION, true);
  writeEntryFields(view, 6, entry);
  bytes.set(entry.name, 30);
  return bytes;
}

function centralHeader(entry: PackedEntry): Uint8Array {
  const { bytes, view } = header(CENTRAL_HEADER, 46 + entry.name.length);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, VERSION, true);
  writeEntryFields(view, 8, entry);
  view.setUint32(42, entry.offset, true);
  bytes.set(entry.name, 46);
  return bytes;
}

function endOfCentral(count: number, size: number, offset: number): Uint8Array {
  const { bytes, view } = header(END_OF_CENTRAL, 22);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  if (total > MAX_UINT32) throw new Error("Архив больше 4 ГБ: такой файл не собрать.");
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export async function zipArchive(entries: ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const packed: PackedEntry[] = [];
  const body: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const item = { name: encoder.encode(entry.name), crc: crc32(entry.data), size: entry.data.length, packed: await deflateRaw(entry.data), offset };
    const local = localHeader(item);
    body.push(local, item.packed);
    packed.push(item);
    offset += local.length + item.packed.length;
  }
  const central = packed.map(centralHeader);
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  return concat([...body, ...central, endOfCentral(packed.length, centralSize, offset)]);
}
