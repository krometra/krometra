import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import type { ModelDocument } from "./bodyHistory";
import type { RebuildPlanStep } from "./browserRebuildPlan";
import { liveBodyIds, syncLiveness } from "./timelineLiveness";
import { regeneratedDocument, withRegenStatuses } from "./timelineRegen";

function entry(id: string, kind: TimelineEntry["kind"], extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return { id, kind, label: id, status: "ok", timestamp: "", ...extra };
}

const body = (visible: boolean) => ({ type: "body", visible });

function chain(patch: Partial<Record<"box" | "fillet" | "cut", Partial<TimelineEntry>>> = {}): ModelDocument {
  return {
    components: { b1: body(false), b2: body(false), b3: body(true), t: body(true) },
    timeline: [
      entry("box", "extrude", { body_id: "b1", ...patch.box }),
      entry("fillet", "fillet", { body_id: "b2", params: { target_body_id: "b1" }, ...patch.fillet }),
      entry("cut", "boolean", { result_body_id: "b3", target_body_id: "b2", tool_body_id: "t", ...patch.cut }),
    ],
  };
}

describe("liveBodyIds", () => {
  it("живы только результаты последних операций", () => {
    expect([...liveBodyIds(chain())].sort()).toEqual(["b3"]);
  });

  it("подавленная операция отдаёт поглощение дальше по цепочке своему исходному телу", () => {
    expect([...liveBodyIds(chain({ fillet: { suppressed: true } }))].sort()).toEqual(["b3"]);
    expect([...liveBodyIds(chain({ cut: { suppressed: true } }))].sort()).toEqual(["b2", "t"]);
  });

  it("после маркера отката живо тело на шаге маркера", () => {
    expect([...liveBodyIds(chain({ fillet: { rolled_back: true }, cut: { rolled_back: true } }))].sort()).toEqual(["b1", "t"]);
  });

  it("не построившаяся операция не прячет вход и не показывает свой результат", () => {
    expect([...liveBodyIds(chain({ cut: { status: "error" } }))].sort()).toEqual(["b2", "t"]);
  });
});

describe("syncLiveness", () => {
  it("меняет видимость только у тел, чья жизнь изменилась, и не трогает скрытое пользователем", () => {
    const before = chain();
    before.components.unrelated = body(false);
    const edited = chain({ cut: { suppressed: true } });
    edited.components.unrelated = body(false);
    const after = syncLiveness(before, edited);

    expect(after.components).toMatchObject({ b2: { visible: true }, t: { visible: true }, b3: { visible: false }, b1: { visible: false } });
    expect(after.components.unrelated).toEqual(body(false));
  });
});

describe("статусы после пересборки", () => {
  const steps = [
    { kind: "alias", entryId: "fillet", bodyId: "b2", fallbackBodyId: "b1" },
    { kind: "boolean", entryId: "cut", label: "cut", outputBodyId: "b3", inputBodyIds: ["b2", "t"], fallbackBodyId: "b2", request: {} },
  ] as RebuildPlanStep[];

  it("ставит ошибку не построившимся и снимает её с построенных, не трогая подавленные", () => {
    const failed = withRegenStatuses(chain({ fillet: { suppressed: true } }), steps, [{ entryId: "cut", message: "Тело не найдено." }]);
    expect(failed.timeline[2]).toMatchObject({ status: "error", error_message: "Тело не найдено." });
    expect(failed.timeline[1].status).toBe("ok");

    const cleared = withRegenStatuses(failed, steps, []);
    expect(cleared.timeline[2].status).toBe("ok");
    expect("error_message" in cleared.timeline[2]).toBe(false);
  });

  it("показывает вход операции, которая не построилась", () => {
    const next = regeneratedDocument(chain(), chain(), steps, [{ entryId: "cut", message: "Не строится." }]);
    expect(next.components).toMatchObject({ b2: { visible: true }, t: { visible: true }, b3: { visible: false } });
  });
});
