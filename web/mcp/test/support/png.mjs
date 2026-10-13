import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PNG_SIGNATURE } from "../../png.mjs";

const CHANNELS_BY_COLOR_TYPE = { 2: 3, 6: 4 };

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((value) => Math.abs(estimate - value));
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

const PREDICTORS = [() => 0, (left) => left, (left, up) => up, (left, up) => (left + up) >> 1, paeth];

function readChunks(buffer) {
  const chunks = [];
  for (let offset = PNG_SIGNATURE.length; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    chunks.push({
      type: buffer.toString("latin1", offset + 4, offset + 8),
      data: buffer.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;
  }
  return chunks;
}

export function decodePng(dataBase64) {
  const buffer = Buffer.from(dataBase64, "base64");
  assert.ok(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), "это не PNG");
  const chunks = readChunks(buffer);
  const header = chunks.find((chunk) => chunk.type === "IHDR").data;
  const [width, height, bitDepth, colorType, interlace] = [
    header.readUInt32BE(0),
    header.readUInt32BE(4),
    header[8],
    header[9],
    header[12],
  ];
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  assert.ok(channels && bitDepth === 8 && interlace === 0, `неподдержанный PNG: тип ${colorType}, глубина ${bitDepth}`);

  const raw = inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const predict = PREDICTORS[raw[row * (stride + 1)]];
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? pixels[target + index - channels] : 0;
      const up = row > 0 ? pixels[target - stride + index] : 0;
      const upLeft = row > 0 && index >= channels ? pixels[target - stride + index - channels] : 0;
      pixels[target + index] = (raw[source + index] + predict(left, up, upLeft)) & 255;
    }
  }

  const pixel = (x, y) => [...pixels.subarray((y * width + x) * channels, (y * width + x) * channels + 3)];
  const count = (matches) => {
    let total = 0;
    for (let offset = 0; offset < pixels.length; offset += channels) {
      if (matches(pixels[offset], pixels[offset + 1], pixels[offset + 2])) total += 1;
    }
    return total;
  };
  return { width, height, pixel, count };
}
