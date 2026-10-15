import { describe, expect, it } from "vitest";
import { unzipForTests } from "./unzipForTests";
import { crc32, zipArchive } from "./zipArchive";

const encode = (text: string) => new TextEncoder().encode(text);

describe("zipArchive", () => {
  it("считает CRC-32 по стандартному контрольному вектору", () => {
    expect(crc32(encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("собирает архив, который распаковывается с теми же именами и содержимым", async () => {
    const long = "вершина ".repeat(5000);
    const archive = await zipArchive([
      { name: "a.txt", data: encode("первый") },
      { name: "dir/b.xml", data: encode(long) },
    ]);
    expect(await unzipForTests(archive)).toEqual([
      { name: "a.txt", text: "первый" },
      { name: "dir/b.xml", text: long },
    ]);
  });

  it("сжимает повторяющиеся данные", async () => {
    const data = encode("<vertex x=\"1\" y=\"2\" z=\"3\"/>".repeat(10_000));
    expect((await zipArchive([{ name: "m", data }])).length).toBeLessThan(data.length / 10);
  });

  it("начинается с локального заголовка PK", async () => {
    const archive = await zipArchive([{ name: "x", data: encode("y") }]);
    expect([...archive.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
