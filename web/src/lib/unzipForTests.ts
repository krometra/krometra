import { crc32 } from "./zipArchive";

export interface UnzippedEntry {
  name: string;
  text: string;
}

const END_OF_CENTRAL = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

function endOfCentralOffset(view: DataView): number {
  for (let at = view.byteLength - 22; at >= 0; at--) {
    if (view.getUint32(at, true) === END_OF_CENTRAL) return at;
  }
  throw new Error("Нет записи конца центрального каталога");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes: Uint8Array, view: DataView, central: number): Promise<{ entry: UnzippedEntry; next: number }> {
  if (view.getUint32(central, true) !== CENTRAL_HEADER) throw new Error("Битый центральный каталог");
  const method = view.getUint16(central + 10, true);
  const crc = view.getUint32(central + 16, true);
  const packedSize = view.getUint32(central + 20, true);
  const size = view.getUint32(central + 24, true);
  const nameLength = view.getUint16(central + 28, true);
  const extraLength = view.getUint16(central + 30, true);
  const commentLength = view.getUint16(central + 32, true);
  const local = view.getUint32(central + 42, true);
  const name = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + nameLength));
  if (view.getUint32(local, true) !== LOCAL_HEADER) throw new Error(`Нет локального заголовка ${name}`);
  const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const packed = bytes.subarray(dataStart, dataStart + packedSize);
  const data = method === 8 ? await inflateRaw(packed) : packed;
  if (data.length !== size) throw new Error(`Размер ${name} не совпал`);
  if (crc32(data) !== crc) throw new Error(`CRC ${name} не совпал`);
  return { entry: { name, text: new TextDecoder().decode(data) }, next: central + 46 + nameLength + extraLength + commentLength };
}

export async function unzipForTests(bytes: Uint8Array): Promise<UnzippedEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOfCentralOffset(view);
  const count = view.getUint16(end + 10, true);
  let central = view.getUint32(end + 16, true);
  const entries: UnzippedEntry[] = [];
  for (let index = 0; index < count; index++) {
    const { entry, next } = await readEntry(bytes, view, central);
    entries.push(entry);
    central = next;
  }
  return entries;
}
