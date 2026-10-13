import { bench, describe } from "vitest";
import { browserRegions } from "@/lib/browserContours";
import { browserMeshData } from "@/lib/browserMesh";
import { nameBody, restoreNaming, saveNaming } from "@/lib/browserNaming";
import { RebuildCache, runRebuild, type RebuildBackend } from "@/lib/browserRebuildEngine";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { TimelineEntry } from "@/types/api";
import { plateTopology, rawPlateMesh } from "./support/meshes";
import { shuffled } from "./support/seeded";
import { perforatedPlate, shuffledContour, starContour } from "./support/sketches";
import { MICRO } from "./support/tiers";

const SIZES = [10, 100, 1000];
const FACE_GRIDS = [{ columns: 2, rows: 5 }, { columns: 10, rows: 10 }, { columns: 25, rows: 40 }];
const MESH_SUBDIVISIONS = 3;
const SKETCH_SEGMENTS = 24;

function namedTopology(columns: number, rows: number) {
  const snapshot = plateTopology(columns, rows);
  const input = { featureKey: "k-bench", faceCount: snapshot.faces.length, lineages: [], generated: [] };
  return { snapshot, input, naming: nameBody(input, snapshot) };
}

function featureChain(length: number): RebuildDocument {
  const timeline = Array.from({ length }, (_, index): TimelineEntry => ({
    id: `feature${index}`,
    timestamp: "",
    label: `feature${index}`,
    status: "ok",
    kind: "extrude",
    sketch_id: "profile",
    body_id: `body${index}`,
    params: {
      engine: "browser_wasm",
      distance: 5,
      operation: index === 0 ? "new_body" : "join",
      target_body_id: index === 0 ? null : `body${index - 1}`,
      feature_key: `k-feature${index}`,
    },
  }));
  return { components: { profile: { type: "sketch", plane: "XY", plane_offset: 0, entities: starContour(SKETCH_SEGMENTS) } }, timeline };
}

const countingBackend: RebuildBackend<number> = {
  build: (step) => step.inputBodyIds.length,
  seat: (step) => step.placement,
  load: () => 0,
  revision: () => 1,
  dispose: () => undefined,
};

describe("ядро без WASM: разбор профиля эскиза (browserRegions)", () => {
  for (const size of SIZES) {
    const contour = shuffledContour(size);
    bench(`замкнутый контур, отрезков: ${size}, порядок случайный`, () => {
      browserRegions(contour);
    }, MICRO);
  }
  for (const size of SIZES) {
    const plate = perforatedPlate(size);
    bench(`плита, отверстий: ${size}`, () => {
      browserRegions(plate);
    }, MICRO);
  }
});

describe("ядро без WASM: сборка меша для вьюпорта (browserMeshData)", () => {
  for (const { columns, rows } of FACE_GRIDS) {
    const raw = rawPlateMesh({ columns, rows, subdivisions: MESH_SUBDIVISIONS });
    bench(`граней: ${columns * rows}, треугольников: ${raw.shape.triangles.length / 3}`, () => {
      browserMeshData(raw.shape, raw.edges, raw.names);
    }, MICRO);
  }
});

describe("ядро без WASM: стабильные имена (browserNaming)", () => {
  for (const { columns, rows } of FACE_GRIDS) {
    const { snapshot, input } = namedTopology(columns, rows);
    bench(`nameBody, граней: ${snapshot.faces.length}, рёбер: ${snapshot.edges.length}`, () => {
      nameBody(input, snapshot);
    }, MICRO);
  }
  for (const { columns, rows } of FACE_GRIDS) {
    const { snapshot, naming } = namedTopology(columns, rows);
    const saved = saveNaming(snapshot, naming);
    const reordered = { ...saved, faces: shuffled(saved.faces, saved.faces.length) };
    bench(`restoreNaming, граней: ${snapshot.faces.length}, порядок после STEP изменился`, () => {
      restoreNaming(reordered, snapshot, "k-restore");
    }, MICRO);
  }
});

describe("ядро без WASM: план пересборки и ключи кэша (browserRebuildPlan + runRebuild)", () => {
  for (const size of SIZES) {
    const document = featureChain(size);
    const cache = new RebuildCache<number>(size, countingBackend.dispose);
    bench(`зависимых операций в истории: ${size}`, () => {
      runRebuild(browserRebuildPlan(document, "feature0", {}), countingBackend, cache);
    }, MICRO);
  }
});
