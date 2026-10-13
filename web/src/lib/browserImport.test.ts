import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import {
  geometryFaceNames,
  geometryNaming,
  IMPORT_EMPTY_FILE,
  importBodyCountError,
  importFileError,
  importSizeError,
  importSummary,
} from "./browserImport";
import { MAX_BODY_STEP_BYTES, MAX_IMPORT_BODIES, MAX_IMPORT_FILE_BYTES, MAX_KERNEL_BODIES, MAX_KERNEL_MODEL_BYTES } from "./browserKernel";
import type { Fingerprint, TopologySnapshot } from "./browserNaming";
import { browserRebuildPlan, editableBrowserParams, isBodyStep, isBrowserFeature, type RebuildDocument } from "./browserRebuildPlan";

const cube: Fingerprint[] = [
  [5, 5, 0, 100],
  [5, 5, 10, 100],
  [0, 5, 5, 100],
  [10, 5, 5, 100],
  [5, 0, 5, 100],
  [5, 10, 5, 100],
];

describe("имена граней импортированного тела", () => {
  it("зависят только от геометрии, а не от порядка обхода", () => {
    const names = geometryFaceNames(cube);
    const reversed = geometryFaceNames([...cube].reverse());

    expect(new Set(names).size).toBe(6);
    expect(names.every((name) => /^f-[0-9a-z]+$/.test(name))).toBe(true);
    expect(reversed).toEqual([...names].reverse());
    expect(geometryFaceNames(cube)).toEqual(names);
  });

  it("не замечают шум ниже допуска и знак нуля", () => {
    const noisy = cube.map((face) => face.map((value) => (value === 0 ? -0 : value + 2e-7)) as Fingerprint);

    expect(geometryFaceNames(noisy)).toEqual(geometryFaceNames(cube));
  });

  it("различают тела разной формы и положения", () => {
    const moved = cube.map(([x, y, z, area]) => [x + 30, y, z, area] as Fingerprint);
    const taller = cube.map(([x, y, z, area]) => [x, y, z * 2, area] as Fingerprint);

    for (const other of [moved, taller]) {
      expect(geometryFaceNames(other).filter((name) => geometryFaceNames(cube).includes(name))).toHaveLength(0);
    }
  });

  it("даёт разные имена совпадающим граням", () => {
    const names = geometryFaceNames([cube[0], cube[0], cube[1]]);

    expect(new Set(names).size).toBe(3);
  });

  it("называет рёбра по именам смежных граней", () => {
    const snapshot: TopologySnapshot = {
      faces: cube,
      edges: [
        { faces: [0, 2], fingerprint: [0, 5, 0, 10] },
        { faces: [0, 3], fingerprint: [10, 5, 0, 10] },
        { faces: [1, 2], fingerprint: [0, 5, 10, 10] },
      ],
    };
    const naming = geometryNaming(snapshot);
    const shuffled = geometryNaming({ faces: snapshot.faces, edges: [...snapshot.edges].reverse() });

    expect(naming.faces).toEqual(geometryFaceNames(cube));
    expect(new Set(naming.edges).size).toBe(3);
    expect(naming.edges.every((name) => name.startsWith("e-"))).toBe(true);
    expect(shuffled.edges).toEqual([...naming.edges].reverse());
  });
});

describe("проверка файла до импорта", () => {
  it("принимает .step и .stp в любом регистре", () => {
    expect(importFileError("bracket.step", 1024)).toBeNull();
    expect(importFileError("Кронштейн v2.STP", 1024)).toBeNull();
  });

  it("отклоняет чужой формат, пустой и слишком большой файл", () => {
    expect(importFileError("model.stl", 1024)).toContain(".step или .stp");
    expect(importFileError("step", 1024)).toContain(".step или .stp");
    expect(importFileError("empty.step", 0)).toBe(IMPORT_EMPTY_FILE);
    expect(importFileError("huge.step", MAX_IMPORT_FILE_BYTES + 1)).toContain("больше предела импорта (50 МБ)");
    expect(importFileError("edge.step", MAX_IMPORT_FILE_BYTES)).toBeNull();
  });
});

describe("лимиты импорта", () => {
  it("ограничивает число тел в файле и в модели", () => {
    expect(importBodyCountError(MAX_IMPORT_BODIES, 0)).toBeNull();
    expect(importBodyCountError(MAX_IMPORT_BODIES + 1, 0)).toContain(`не больше ${MAX_IMPORT_BODIES}`);
    expect(importBodyCountError(2, MAX_KERNEL_BODIES - 2)).toBeNull();
    expect(importBodyCountError(2, MAX_KERNEL_BODIES - 1)).toContain(`${MAX_KERNEL_BODIES + 1} тело`);
  });

  it("ограничивает STEP одного тела и общий объём модели", () => {
    const totals = { bodyCount: 3, modelBytes: MAX_KERNEL_MODEL_BYTES - 1000 };

    expect(importSizeError(totals, [400, 600])).toBeNull();
    expect(importSizeError(totals, [400, 601])).toContain("больше предела браузерного ядра");
    expect(importSizeError({ bodyCount: 0, modelBytes: 0 }, [10, MAX_BODY_STEP_BYTES + 1])).toContain("Тело 2 из файла");
  });

  it("склоняет итог импорта", () => {
    expect(importSummary("a.step", 1)).toBe("Импортировано 1 тело из «a.step».");
    expect(importSummary("a.step", 3)).toBe("Импортировано 3 тела из «a.step».");
    expect(importSummary("a.step", 12)).toBe("Импортировано 12 тел из «a.step».");
  });
});

describe("запись импорта в плане пересборки", () => {
  const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
    timestamp: "", label: patch.id, status: "ok", ...patch,
  });
  const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
  const document: RebuildDocument = {
    components: {},
    timeline: [
      entry({ id: "i1", kind: "import", body_id: "b1", params: browser({ file_name: "pair.step", body_index: 0, body_count: 2 }) }),
      entry({ id: "i2", kind: "import", body_id: "b2", params: browser({ file_name: "pair.step", body_index: 1, body_count: 2 }) }),
      entry({ id: "f1", kind: "fillet", body_id: "b3", params: browser({ target_body_id: "b1", edge_ids: ["e-a"], radius: 1, feature_key: "kf" }) }),
      entry({ id: "bo", kind: "boolean", result_body_id: "b4", target_body_id: "b3", tool_body_id: "b2", operation: "union", params: browser({ feature_key: "kb" }) }),
    ],
  };

  it("импорт — операция браузерного ядра без редактируемых параметров", () => {
    expect(isBrowserFeature(document.timeline[0])).toBe(true);
    expect(editableBrowserParams("import")).toEqual([]);
  });

  it("корень-импорт отдаёт своё тело и тянет только зависимые операции", () => {
    const steps = browserRebuildPlan(document, "i1", {});

    expect(steps.map((step) => step.entryId)).toEqual(["i1", "f1", "bo"]);
    expect(steps[0]).toMatchObject({ kind: "import", outputBodyId: "b1", inputBodyIds: [], request: { kind: "import", bodyId: "b1" } });
  });

  it("операция над импортированным телом не пересобирает сам импорт", () => {
    const steps = browserRebuildPlan(document, "f1", { radius: 2 }).filter(isBodyStep);

    expect(steps.map((step) => step.entryId)).toEqual(["f1", "bo"]);
    expect(steps[1].inputBodyIds).toEqual(["b3", "b2"]);
  });
});
