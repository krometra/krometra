import { bench, describe } from "vitest";
import { bestEdgeHit, type ScoredHit } from "@/composables/viewport/edgePicking";
import type { RenderingMode } from "@/composables/viewport/types";
import { useEdgeSelection } from "@/composables/viewport/useEdgeSelection";
import { useFaceSelection } from "@/composables/viewport/useFaceSelection";
import { usePlaneHelpers } from "@/composables/viewport/usePlaneHelpers";
import { browserFaceBoundary, browserFacePlane } from "@/lib/browserFacePlane";
import { plateMesh, plateSize, squareGrid, type PlateGrid } from "./support/meshes";
import { benchScene } from "./support/scene";
import { seededRandom } from "./support/seeded";
import { MICRO } from "./support/tiers";

const EDGE_GRIDS = [squareGrid(2, 4), squareGrid(7, 4), squareGrid(22, 4)];
const TRIANGLE_GRIDS = [squareGrid(8, 3), squareGrid(8, 9), squareGrid(8, 28)];
const MEDIUM_GRID = TRIANGLE_GRIDS[1];

const triangleCount = (grid: PlateGrid) => grid.columns * grid.rows * grid.subdivisions ** 2 * 2;
const edgeCount = (grid: PlateGrid) => grid.columns * (grid.rows + 1) + grid.rows * (grid.columns + 1);

function scoredHits(count: number): ScoredHit<number>[] {
  const random = seededRandom(count);
  return Array.from({ length: count }, (_, hit) => ({ hit, px: random() * 14, distance: 50 + random() * 100 }));
}

function sceneWith(grid: PlateGrid, renderingMode: RenderingMode = "shaded") {
  const scene = benchScene(plateSize(grid), renderingMode);
  scene.registry.addMesh(plateMesh(grid), "plate");
  return scene;
}

describe("вьюпорт: победитель среди попаданий по рёбрам (bestEdgeHit)", () => {
  for (const count of [10, 100, 1000]) {
    const hits = scoredHits(count);
    bench(`попаданий: ${count}`, () => {
      bestEdgeHit(hits);
    }, MICRO);
  }
});

describe("вьюпорт: кадр наведения в режиме рёбер (raycast линий + выбор + подсветка)", () => {
  for (const grid of EDGE_GRIDS) {
    const { context, moveCursor } = sceneWith(grid);
    const edges = useEdgeSelection({ context, onChanged: () => undefined });
    bench(`рёбер в теле: ${edgeCount(grid)}`, () => {
      moveCursor();
      edges.handleHover();
    }, MICRO);
  }
});

describe("вьюпорт: кадр наведения в режиме граней (raycast меша + перекраска грани)", () => {
  for (const grid of TRIANGLE_GRIDS) {
    const { context, moveCursor } = sceneWith(grid);
    const faces = useFaceSelection({ context, onSelected: () => undefined, onCleared: () => undefined });
    bench(`треугольников: ${triangleCount(grid)}`, () => {
      moveCursor();
      faces.handleHover();
    }, MICRO);
  }
});

describe("вьюпорт: базовая плоскость против тела под курсором (planes.pick + pickPriority)", () => {
  const { context, moveCursor } = sceneWith(MEDIUM_GRID);
  const planes = usePlaneHelpers(context);
  planes.show();
  bench(`треугольников: ${triangleCount(MEDIUM_GRID)}`, () => {
    moveCursor();
    planes.pick();
  }, MICRO);
});

describe("вьюпорт: загрузка меша в сцену (addMesh с заменой тела)", () => {
  for (const grid of TRIANGLE_GRIDS) {
    const { registry } = sceneWith(grid);
    const mesh = plateMesh(grid);
    bench(`треугольников: ${triangleCount(grid)}, режим shaded`, () => {
      registry.addMesh(mesh, "plate");
    }, MICRO);
  }
  const { registry } = sceneWith(MEDIUM_GRID, "shaded_edges");
  const mesh = plateMesh(MEDIUM_GRID);
  bench(`треугольников: ${triangleCount(MEDIUM_GRID)}, режим shaded_edges`, () => {
    registry.addMesh(mesh, "plate");
  }, MICRO);
});

describe("вьюпорт: передача меша из worker'а (structuredClone как у postMessage)", () => {
  for (const grid of TRIANGLE_GRIDS) {
    const mesh = plateMesh(grid);
    bench(`треугольников: ${triangleCount(grid)}`, () => {
      structuredClone(mesh);
    }, MICRO);
  }
});

describe("вьюпорт: плоскость эскиза по грани меша (browserFacePlane + browserFaceBoundary)", () => {
  for (const grid of TRIANGLE_GRIDS) {
    const mesh = plateMesh(grid);
    const faceId = mesh.brep_topo.faces[mesh.brep_topo.faces.length - 1].face_id;
    bench(`треугольников: ${triangleCount(grid)}`, () => {
      const plane = browserFacePlane(mesh, faceId);
      if (plane) browserFaceBoundary(mesh, faceId, plane.basis);
    }, MICRO);
  }
});
