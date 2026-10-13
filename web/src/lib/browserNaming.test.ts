import { describe, expect, it } from "vitest";
import {
  generatedFaceName,
  isSavedNaming,
  nameEdges,
  nameFaces,
  resolveNames,
  restoreNaming,
  saveNaming,
  stableHash,
  type Fingerprint,
  type TopologySnapshot,
} from "./browserNaming";

const fp = (x: number, size = 1): Fingerprint => [x, 0, 0, size];

describe("nameFaces", () => {
  it("переносит имена по истории и делит разрезанную грань суффиксами", () => {
    const names = nameFaces({
      featureKey: "k",
      faceCount: 4,
      lineages: [{ names: ["f-a", "f-b"], images: [[2, 0], []] }],
      generated: [{ key: "fillet:e-x", images: [1] }],
    });

    expect(names).toEqual(["f-a~1", generatedFaceName("k", "fillet:e-x"), "f-a", generatedFaceName("k", "n0")]);
  });

  it("отдаёт слитую грань первому претенденту и не дублирует имена", () => {
    const names = nameFaces({
      featureKey: "k",
      faceCount: 2,
      lineages: [
        { names: ["f-target"], images: [[0]] },
        { names: ["f-tool", "f-other"], images: [[0], [1]] },
      ],
      generated: [{ key: "side:x", images: [1] }],
    });

    expect(names).toEqual(["f-target", "f-other"]);
  });

  it("детерминирован для одинакового входа", () => {
    const input = { featureKey: "k", faceCount: 3, lineages: [], generated: [{ key: "side:a", images: [2] }] };
    expect(nameFaces(input)).toEqual(nameFaces(input));
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });
});

describe("nameEdges", () => {
  const snapshot: TopologySnapshot = {
    faces: [fp(0), fp(1), fp(2)],
    edges: [
      { faces: [0, 1], fingerprint: fp(5) },
      { faces: [1, 0], fingerprint: fp(3) },
      { faces: [1, 2], fingerprint: fp(1) },
      { faces: [2, 2], fingerprint: fp(9) },
    ],
  };

  it("называет ребро по паре соседних граней независимо от порядка", () => {
    const names = nameEdges(snapshot, ["f-a", "f-b", "f-c"]);
    const reordered = nameEdges({ ...snapshot, edges: [snapshot.edges[2], snapshot.edges[3], snapshot.edges[1], snapshot.edges[0]] }, ["f-a", "f-b", "f-c"]);

    expect(new Set(names).size).toBe(4);
    expect(reordered).toEqual([names[2], names[3], names[1], names[0]]);
  });

  it("имя ребра меняется только вместе с именами его граней", () => {
    const before = nameEdges(snapshot, ["f-a", "f-b", "f-c"]);
    const after = nameEdges(snapshot, ["f-a", "f-b", "f-z"]);

    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]).not.toBe(before[2]);
  });
});

describe("сохранение и восстановление имён", () => {
  const snapshot: TopologySnapshot = {
    faces: [fp(0, 4), fp(10, 4), fp(20, 2)],
    edges: [{ faces: [0, 1], fingerprint: fp(5) }, { faces: [1, 2], fingerprint: fp(15) }],
  };
  const naming = { faces: ["f-a", "f-b", "f-c"], edges: nameEdges(snapshot, ["f-a", "f-b", "f-c"]) };

  it("восстанавливает имена при том же порядке граней", () => {
    expect(restoreNaming(saveNaming(snapshot, naming), snapshot, "body")).toEqual(naming);
  });

  it("находит грани по отпечатку, если STEP переставил их", () => {
    const shuffled: TopologySnapshot = {
      faces: [snapshot.faces[2], snapshot.faces[0], snapshot.faces[1]],
      edges: [{ faces: [1, 2], fingerprint: fp(5) }, { faces: [2, 0], fingerprint: fp(15) }],
    };
    const restored = restoreNaming(saveNaming(snapshot, naming), shuffled, "body");

    expect(restored.faces).toEqual(["f-c", "f-a", "f-b"]);
    expect(restored.edges).toEqual(naming.edges);
  });

  it("даёт детерминированные имена телу без сохранённой таблицы", () => {
    const first = restoreNaming(null, snapshot, "body-1");
    expect(restoreNaming(null, snapshot, "body-1")).toEqual(first);
    expect(first.faces[0]).toBe(generatedFaceName("body-1", "n0"));
  });

  it("проверяет формат сохранённой таблицы", () => {
    expect(isSavedNaming(saveNaming(snapshot, naming))).toBe(true);
    expect(isSavedNaming({ version: 1, faces: [{ name: "f", fingerprint: [0, 0, 0] }] })).toBe(false);
    expect(isSavedNaming({ version: 2, faces: [] })).toBe(false);
  });
});

describe("resolveNames", () => {
  it("возвращает текущие индексы и объясняет пропавшее имя", () => {
    expect(resolveNames(["e-a", "e-b"], ["e-b"], "ребро")).toEqual([1]);
    expect(() => resolveNames(["e-a"], ["e-x"], "ребро")).toThrow("Ребро «e-x» больше не существует");
  });
});
