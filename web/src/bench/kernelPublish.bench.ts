import { bench, describe } from "vitest";
import type { WorkerReply } from "@/workers/testing/workerHarness";
import { retainPart } from "./support/bodies";
import { kernel, onFreshKernel, send } from "./support/kernel";
import { KERNEL } from "./support/tiers";

let part: WorkerReply;

const onPart = onFreshKernel(KERNEL, async () => {
  part = await retainPart("part");
});

const partShape = () => kernel().shapes.namedBodyShape("part");

describe("ядро: меш, имена и обмен (плита с 16 отверстиями и 4 скруглёнными углами, 26 граней)", () => {
  bench("тесселяция: тело → меш с именами граней и рёбер", () => {
    kernel().namedMesh.publishedBody(partShape());
  }, onPart);

  bench("имена: обход топологии, отпечатки и имена с нуля", () => {
    kernel().naming.namedFresh(partShape().shape, "k-fresh");
  }, onPart);

  bench("экспорт STEP", async () => {
    await send({ kind: "export", format: "step", bodyIds: ["part"] });
  }, onPart);

  bench("экспорт STL (binary)", async () => {
    await send({ kind: "export", format: "stl", bodyIds: ["part"] });
  }, onPart);

  bench("гидрация из STEP с сохранёнными именами", async () => {
    await send({ kind: "hydrate", bodyId: "hydrated", step: part.step, naming: part.naming });
  }, onPart);

  bench("гидрация из STEP без имён (плюс меш)", async () => {
    await send({ kind: "hydrate", bodyId: "hydrated", step: part.step, naming: null });
  }, onPart);
});
