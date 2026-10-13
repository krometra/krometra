import { bench, describe } from "vitest";
import { circle, extrudeRequest } from "@/workers/testing/workerHarness";
import { boxRequest, PLATE_HEIGHT, REFERENCE_HOLES, REFERENCE_SIDE, retainPlate, retainSlab } from "./support/bodies";
import { onFreshKernel, roundTrip } from "./support/kernel";
import { holeGrid, perforatedPlate, starContour, steppedShaft } from "./support/sketches";
import { HEAVY, KERNEL } from "./support/tiers";

const SLOW_HOLES = 64;
const SLOW_SEGMENTS = 100;
const SHAFT_STEPS = 8;

function revolveRequest(featureKey: string, angle: number, direction: "one_side" | "symmetric") {
  return {
    kind: "revolve",
    entities: steppedShaft(SHAFT_STEPS),
    plane: "XY",
    planeOffset: 0,
    planeBasis: null,
    axisOrigin: { x: 0, y: 0 },
    axis: "y",
    angle,
    direction,
    featureKey,
  };
}

describe("ядро: выдавливание (сообщение worker'а: тело + имена + меш + STEP)", () => {
  bench("брусок 20×10×10", async () => roundTrip(boxRequest("k-box")), onFreshKernel(KERNEL));

  for (const holes of [4, REFERENCE_HOLES, SLOW_HOLES]) {
    bench(
      `плита, отверстий: ${holes}`,
      async () => roundTrip(extrudeRequest(perforatedPlate(holes), "k-plate", { distance: PLATE_HEIGHT })),
      onFreshKernel(holes < SLOW_HOLES ? KERNEL : HEAVY),
    );
  }

  for (const segments of [10, SLOW_SEGMENTS]) {
    bench(
      `контур, отрезков: ${segments}`,
      async () => roundTrip(extrudeRequest(starContour(segments), "k-star")),
      onFreshKernel(segments < SLOW_SEGMENTS ? KERNEL : HEAVY),
    );
  }

  bench(
    "приклейка бобышки к плите с 16 отверстиями (join)",
    async () => roundTrip(extrudeRequest([circle("boss", REFERENCE_SIDE / 2, REFERENCE_SIDE / 2, 3.5)], "k-boss", {
      planeOffset: PLATE_HEIGHT,
      operation: "join",
      targetBodyId: "plate",
    })),
    onFreshKernel(KERNEL, () => retainPlate("plate")),
  );

  bench(
    "вырез 16 отверстий насквозь в сплошной плите (cut)",
    async () => roundTrip(extrudeRequest(holeGrid(REFERENCE_HOLES), "k-holes", {
      planeOffset: PLATE_HEIGHT,
      distance: -1,
      extentType: "through_all",
      operation: "cut",
      targetBodyId: "slab",
    })),
    onFreshKernel(KERNEL, () => retainSlab("slab", REFERENCE_SIDE)),
  );
});

describe("ядро: вращение (сообщение worker'а: тело + имена + меш + STEP)", () => {
  bench(
    `ступенчатый вал, ступеней: ${SHAFT_STEPS}, 360°`,
    async () => roundTrip(revolveRequest("k-shaft", 360, "one_side")),
    onFreshKernel(KERNEL),
  );
  bench(
    "сектор вала 90°, симметрично",
    async () => roundTrip(revolveRequest("k-sector", 90, "symmetric")),
    onFreshKernel(KERNEL),
  );
});
