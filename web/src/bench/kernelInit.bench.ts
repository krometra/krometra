import { bench, describe } from "vitest";
import { freshKernel, wasmPath } from "./support/kernel";
import { KERNEL } from "./support/tiers";

interface ChildProcess {
  spawnSync(file: string, args: string[], options: { cwd: string; encoding: "utf8" }): { stdout: string };
}

const childProcessModule: string = "node:child_process";
const { spawnSync } = (await import(childProcessModule)) as ChildProcess;
const nodePath = (globalThis as unknown as { process: { execPath: string } }).process.execPath;
const webRoot = decodeURIComponent(new URL("../../", import.meta.url).pathname);

const INIT_SCRIPT = `
import initOpenCascade from "replicad-opencascadejs";
console.log = () => undefined;
const oc = await initOpenCascade({ locateFile: () => process.argv[1] });
`;

const FIRST_BODY_SCRIPT = `${INIT_SCRIPT}
import { drawRectangle, setOC } from "replicad";
setOC(oc);
const mesh = { tolerance: 0.01, angularTolerance: 0.5 };
const body = drawRectangle(20, 10).sketchOnPlane("XY").extrude(10);
body.mesh(mesh);
body.meshEdges(mesh);
await body.blobSTEP().arrayBuffer();
`;

const FINISH_SCRIPT = `
process.stdout.write("ready", () => process.kill(process.pid, "SIGKILL"));
`;

function runNode(script: string) {
  const { stdout } = spawnSync(nodePath, ["--input-type=module", "-e", script + FINISH_SCRIPT, wasmPath], { cwd: webRoot, encoding: "utf8" });
  if (stdout !== "ready") throw new Error("Дочерний процесс node не дошёл до конца сценария холодного старта.");
}

describe("ядро: инициализация", () => {
  bench("новый процесс node без ядра (база для вычитания)", async () => runNode(""), KERNEL);
  bench("холодный старт: новый процесс + init OCCT/WASM", async () => runNode(INIT_SCRIPT), KERNEL);
  bench("холодный старт: новый процесс + init + первое тело (меш и STEP)", async () => runNode(FIRST_BODY_SCRIPT), KERNEL);
  bench("перезапуск ядра в том же процессе (модули worker'а + init)", async () => {
    await freshKernel();
  }, KERNEL);
});
