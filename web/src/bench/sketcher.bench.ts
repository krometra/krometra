import { bench, describe } from "vitest";
import { profileFaces } from "@/sketcher/contours";
import { snapAt } from "@/sketcher/snapCandidates";
import { solveSketch } from "@/sketcher/solver/solveSketch";
import { constrainedSketch, mixedSketch, perforatedPlate, shuffledContour } from "./support/sketches";
import { MICRO } from "./support/tiers";

const SIZES = [10, 100, 1000];
const SNAP_THRESHOLD = 0.5;
const EMPTY_SPOT = { x: -37.3, y: -41.7 };

describe("скетчер: решатель ограничений (solveSketch)", () => {
  for (const size of SIZES) {
    const { entities, constraints } = constrainedSketch(size);
    bench(`сущностей: ${size}, ограничений: ${constraints.length}`, () => {
      solveSketch(entities, constraints);
    }, MICRO);
  }
});

describe("скетчер: привязка под курсором на каждое движение мыши (snapAt)", () => {
  for (const size of SIZES) {
    const entities = mixedSketch(size);
    bench(`сущностей: ${size}, курсор в пустом месте`, () => {
      snapAt(entities, EMPTY_SPOT, SNAP_THRESHOLD);
    }, MICRO);
  }
});

describe("скетчер: контуры призрака выдавливания (profileFaces)", () => {
  for (const size of SIZES) {
    const contour = shuffledContour(size);
    bench(`замкнутый контур, отрезков: ${size}, порядок случайный`, () => {
      profileFaces(contour);
    }, MICRO);
  }
  for (const size of SIZES) {
    const plate = perforatedPlate(size);
    bench(`плита, отверстий: ${size}`, () => {
      profileFaces(plate);
    }, MICRO);
  }
});
