import { describe, expect, it } from "vitest";
import { liveBodyId } from "./browserBodySuccession";

const bodies = [
  { id: "box", visible: false, source: { kind: "browser_extrude" } },
  { id: "tool", visible: false, source: { kind: "browser_extrude" } },
  { id: "filleted", visible: false, source: { kind: "browser_fillet", target_body_id: "box" } },
  { id: "joined", visible: false, source: { kind: "browser_extrude", operation: "join", target_body_id: "filleted" } },
  { id: "united", source: { kind: "browser_boolean", target_body_id: "joined", tool_body_id: "tool" } },
  { id: "lone", visible: false, source: { kind: "browser_extrude" } },
];

describe("liveBodyId", () => {
  it("оставляет видимое тело как есть", () => {
    expect(liveBodyId(bodies, "united")).toBe("united");
  });

  it("проходит цепочку скругление, приклеивание, булева до живого тела", () => {
    expect(liveBodyId(bodies, "box")).toBe("united");
    expect(liveBodyId(bodies, "tool")).toBe("united");
  });

  it("не подставляет тело, если преемника нет или тело удалено", () => {
    expect(liveBodyId(bodies, "lone")).toBeNull();
    expect(liveBodyId(bodies, "gone")).toBeNull();
    expect(liveBodyId(bodies, null)).toBeNull();
  });

  it("не зацикливается на повреждённой истории", () => {
    const loop = [
      { id: "a", visible: false, source: { target_body_id: "b" } },
      { id: "b", visible: false, source: { target_body_id: "a" } },
    ];

    expect(liveBodyId(loop, "a")).toBeNull();
  });
});
