import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Document } from "@/types/api";

const api = { get: vi.fn(), put: vi.fn() };
const toast = vi.fn();

vi.mock("@/composables/useApi", () => ({ useApi: () => api }));
vi.mock("@/composables/useToast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { captureSnapshot, restoreSnapshot } = await import("./documentSnapshot");

const doc = (version: number, extra: Partial<Document> = {}): Document =>
  ({
    id: "d1",
    project_id: "p1",
    components: { b1: { type: "body" } },
    timeline: [{ id: "tl-1" }],
    metadata: { names: {} },
    version,
    created_at: "",
    updated_at: "",
    ...extra,
  }) as unknown as Document;

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  toast.mockReset();
});

describe("captureSnapshot", () => {
  it("сохраняет components, timeline и версию", () => {
    const snap = captureSnapshot(doc(7))!;
    expect(snap.version).toBe(7);
    expect(snap.components).toEqual({ b1: { type: "body" } });
    expect(snap.timeline).toEqual([{ id: "tl-1" }]);
  });

  it("снимок глубокий: правка документа его не меняет", () => {
    const source = doc(1);
    const snap = captureSnapshot(source)!;
    (source.components as Record<string, unknown>).b1 = { type: "changed" };
    (source.timeline as unknown[]).push({ id: "tl-2" });

    expect(snap.components).toEqual({ b1: { type: "body" } });
    expect(snap.timeline).toHaveLength(1);
  });

  it("нет документа — нет снимка", () => {
    expect(captureSnapshot(null)).toBeNull();
  });
});

describe("restoreSnapshot", () => {
  it("откатывает документ и пишет его текущей версией", async () => {
    const snap = captureSnapshot(doc(5))!;
    api.get.mockResolvedValue(doc(6, { metadata: { names: { b1: "Корпус" } } }));
    api.put.mockResolvedValue(doc(7));

    expect(await restoreSnapshot("p1", snap)).toBe(true);

    const [, body] = api.put.mock.calls[0];
    expect(body.components).toEqual(snap.components);
    // Пишем текущей версией, иначе оптимистичная блокировка отвергнет запрос.
    expect(body.version).toBe(6);
    // metadata берём свежий: имена тел не должны откатываться вместе с геометрией.
    expect(body.metadata).toEqual({ names: { b1: "Корпус" } });
  });

  it("не затирает чужие правки, если документ ушёл вперёд", async () => {
    const snap = captureSnapshot(doc(5))!;
    // Операция подняла версию до 6; 8 означает, что были ещё чужие изменения.
    api.get.mockResolvedValue(doc(8));

    expect(await restoreSnapshot("p1", snap)).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Документ изменился"), "warning");
  });

  it("откат разрешён ровно на версии самой операции", async () => {
    const snap = captureSnapshot(doc(5))!;
    api.get.mockResolvedValue(doc(6));
    api.put.mockResolvedValue(doc(7));

    expect(await restoreSnapshot("p1", snap)).toBe(true);
  });

  it("явный ожидаемый предел версии учитывается", async () => {
    const snap = captureSnapshot(doc(5))!;
    api.get.mockResolvedValue(doc(9));
    api.put.mockResolvedValue(doc(10));

    // Операция подняла версию на несколько шагов — это по-прежнему «своё».
    expect(await restoreSnapshot("p1", snap, 9)).toBe(true);
    expect(api.put).toHaveBeenCalled();
  });

  it("документ не читается — откат не выполняется", async () => {
    const snap = captureSnapshot(doc(5))!;
    api.get.mockResolvedValue(null);

    expect(await restoreSnapshot("p1", snap)).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
  });
});
