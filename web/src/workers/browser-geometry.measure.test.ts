import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import type { MeasureResult } from "@/lib/measure";
import { buildBody, circle, extrudeRequest, send, sendOk } from "./testing/workerHarness";
import { loadQuietWorker } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const ROD = "ms-rod";
const ROD_KEY = "k-ms-rod";

beforeAll(async () => {
  await loadQuietWorker();
  await buildBody(extrudeRequest([circle("c", 0, 0, 4)], ROD_KEY, { distance: 10 }), ROD);
}, 60_000);

describe("измерение через сообщения worker (реальный OCCT/WASM)", () => {
  it("отвечает свойствами грани и тела, не меняя тело", async () => {
    const reply = await sendOk({
      kind: "measure",
      refs: [{ kind: "face", bodyId: ROD, faceId: generatedFaceName(ROD_KEY, "side:c") }, { kind: "body", bodyId: ROD }],
    });
    const { items, pair } = reply.measure as MeasureResult;

    expect(items[0]).toMatchObject({ kind: "face", surface: "cylinder", radius: 4 });
    expect(items[1]).toMatchObject({ kind: "body" });
    expect(items[1].kind === "body" && items[1].volume).toBeCloseTo(Math.PI * 16 * 10, 6);
    expect(pair?.distance).toBeCloseTo(0, 9);
    expect(reply.step).toBeUndefined();
    expect(reply.shapeHandle).toBeUndefined();
  });

  it("исчезнувшая грань — ответ с ошибкой, а не падение ядра", async () => {
    const reply = await send({ kind: "measure", refs: [{ kind: "face", bodyId: ROD, faceId: "f-нет" }] });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/больше не существует/);
  });
});
