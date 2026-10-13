export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const HEADER_BYTES = 24;
const HEADER_BASE64_CHARS = 32;
const WIDTH_OFFSET = 16;
const HEIGHT_OFFSET = 20;

export function readPngSize(dataBase64) {
  const header = Buffer.from(dataBase64.slice(0, HEADER_BASE64_CHARS), "base64");
  if (header.length < HEADER_BYTES || !header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  return { width: header.readUInt32BE(WIDTH_OFFSET), height: header.readUInt32BE(HEIGHT_OFFSET) };
}
