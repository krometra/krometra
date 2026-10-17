import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildBody, extrudeRequest, loadWorker, rectangle, send, sendOk } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadWorker();
  await buildBody(extrudeRequest([rectangle("a", 0, 0, 10, 10)], "k-export-a"), "export-a");
  await buildBody(extrudeRequest([rectangle("b", 30, 0, 40, 10)], "k-export-b"), "export-b");
}, 60_000);

const BOTH = ["export-a", "export-b"];

function stlTriangles(file: ArrayBuffer | undefined): number {
  return new DataView(file!).getUint32(80, true);
}

describe("экспорт из browser worker (реальный OCCT/WASM)", () => {
  it("несколько тел уходят одним файлом и остаются в ядре для следующих команд", async () => {
    const first = await sendOk({ kind: "export", format: "stl", bodyIds: BOTH });
    expect(stlTriangles(first.file)).toBe(24);

    const second = await send({ kind: "export", format: "stl", bodyIds: BOTH });
    expect(second.error, "повторный экспорт тех же тел").toBeUndefined();
    expect(stlTriangles(second.file)).toBe(24);

    const step = await sendOk({ kind: "export", format: "step", bodyIds: [...BOTH].reverse() });
    expect(new TextDecoder().decode(step.file!.slice(0, 13))).toBe("ISO-10303-21;");
  });

  it("после общего экспорта каждое тело экспортируется отдельно и участвует в операциях", async () => {
    await sendOk({ kind: "export", format: "stl", bodyIds: BOTH });

    for (const bodyId of BOTH) {
      const alone = await sendOk({ kind: "export", format: "stl", bodyIds: [bodyId] });
      expect(stlTriangles(alone.file), bodyId).toBe(12);
    }
    const joined = await send({ kind: "boolean", operation: "union", targetBodyId: "export-a", toolBodyIds: ["export-b"], featureKey: "k-export-union" });
    expect(joined.error, "тела живы для булевой операции").toBeUndefined();
  });

  it("пустой список тел — понятная ошибка", async () => {
    const reply = await send({ kind: "export", format: "stl", bodyIds: [] });
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("Нечего экспортировать");
  });
});
