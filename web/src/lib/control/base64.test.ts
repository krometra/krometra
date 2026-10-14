import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./base64";

function decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

describe("bytesToBase64", () => {
  it("кодирует байты, включая нулевые и старшие", () => {
    expect(bytesToBase64(new Uint8Array([0, 255, 16, 128]))).toBe("AP8QgA==");
    expect(bytesToBase64(new TextEncoder().encode("ISO-10303-21;"))).toBe("SVNPLTEwMzAzLTIxOw==");
  });

  it("пустой буфер даёт пустую строку", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("буфер больше одного куска кодируется без потерь на стыках", () => {
    const bytes = Uint8Array.from({ length: 100_003 }, (_, index) => (index * 31 + 7) % 256);
    expect(decode(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("base64ToBytes", () => {
  it("декодирует то, что закодировал bytesToBase64", () => {
    const bytes = new Uint8Array([0, 255, 16, 128]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("на мусоре возвращает null", () => {
    expect(base64ToBytes("не base64!")).toBeNull();
  });
});
