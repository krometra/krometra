import { bench, describe } from "vitest";
import { kernel, onFreshKernel, retain, roundTrip, send } from "./support/kernel";
import { CROWN_PLUG, crownRevolve, cylinderFace, slotCut, threadRequest, TOWER_BORE, towerRevolve } from "./support/rook";
import { HEAVY, KERNEL } from "./support/tiers";

const TOWER = "rook-tower";
const CROWN = "rook-crown";
const PARTS = [`${TOWER}-threaded`, `${CROWN}-slotted`];

let bore = "";
let plug = "";

async function retainTower() {
  bore = cylinderFace(await retain(towerRevolve(), TOWER), TOWER_BORE);
}

async function retainCrown() {
  plug = cylinderFace(await retain(crownRevolve(), CROWN), CROWN_PLUG);
}

const towerThread = () => threadRequest(TOWER, bore, "k-rook-tower-thread");
const crownThread = () => threadRequest(CROWN, plug, "k-rook-crown-thread");
const crownSlots = () => slotCut(`${CROWN}-threaded`);

async function retainThreadedCrown() {
  await retainCrown();
  await retain(crownThread(), `${CROWN}-threaded`);
}

async function buildRook() {
  await retainTower();
  await retain(towerThread(), PARTS[0]);
  await retainThreadedCrown();
  await retain(crownSlots(), PARTS[1]);
}

async function exportParts(format: "stl" | "step") {
  for (const part of PARTS) await send({ kind: "export", format, bodyIds: [part] });
}

describe("ядро: ладья Rook Vault, сборка по шагам (сообщения worker'а)", () => {
  bench("1. башня: вращение профиля из 15 отрезков на XZ, 360°", async () => roundTrip(towerRevolve()), onFreshKernel(KERNEL));
  bench("2. башня: внутренняя резьба в горловине R12.85, шаг 3", async () => roundTrip(towerThread()), onFreshKernel(HEAVY, retainTower));
  bench("3. корона: вращение профиля из 12 отрезков вокруг оси x=70", async () => roundTrip(crownRevolve()), onFreshKernel(KERNEL));
  bench("4. корона: внешняя резьба на пробке R13.75, шаг 3", async () => roundTrip(crownThread()), onFreshKernel(HEAVY, retainCrown));
  bench("5. корона: вырез шести прорезей на 4 мм (24 отрезка)", async () => roundTrip(crownSlots()), onFreshKernel(KERNEL, retainThreadedCrown));
  bench("6. тесселяция обеих готовых деталей", () => {
    for (const part of PARTS) kernel().namedMesh.publishedBody(kernel().shapes.namedBodyShape(part));
  }, onFreshKernel(KERNEL, buildRook));
  bench("6. экспорт STL обеих деталей", async () => exportParts("stl"), onFreshKernel(KERNEL, buildRook));
  bench("6. экспорт STEP обеих деталей", async () => exportParts("step"), onFreshKernel(KERNEL, buildRook));
});

describe("ядро: ладья Rook Vault, вся сборка", () => {
  bench("от пустого ядра до STL и STEP обеих деталей (шаги 1-6)", async () => {
    await buildRook();
    await exportParts("stl");
    await exportParts("step");
  }, onFreshKernel(HEAVY));
});
