import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { imageOf } from "../mcp/test/support/mcp-client.mjs";
import {
  BOARD_LEVELS,
  BOTTOM,
  CAMERA,
  CAMERA_HOLDER_LEVELS,
  CAMERA_LEVELS,
  PCB,
  PCB_LEVELS,
  TOP,
  cameraCutSketch,
  circle,
  pcbHoles,
  pcbSketch,
  rect,
} from "../mcp/test/support/maixcam.mjs";
import { McpCad, expectLevels, topFace, type EditorState } from "./helpers/mcp";

const REVIEW = "~/Projects/krometra/mcp-review.md";
const REQUIRED_OPS = ["state", "topology", "mesh.stats", "sketch.create", "extrude", "export", "viewport.capture", "history.undo"];
const STL_HEADER_BYTES = 84;
const STL_TRIANGLE_BYTES = 50;

const issue = (point: string) => ({ annotation: { type: "issue", description: `${REVIEW}, ${point}` } });

const lastEntries = (state: EditorState) => state.timeline.map((entry) => entry.id);
const visibleBodies = (state: EditorState) => state.bodies.filter((body) => body.visible).map((body) => body.id).sort();

test.describe("MCP: плата MaixCAM на живом редакторе", () => {
  let cad: McpCad;
  let exportDir: string;

  test.beforeAll(async () => {
    cad = McpCad.start();
    exportDir = await mkdtemp(path.join(tmpdir(), "krometra-mcp-e2e-"));
  });

  test.afterAll(async () => {
    await cad?.stop();
    if (exportDir) await rm(exportDir, { recursive: true, force: true });
  });

  test("сценарий: плата, компоненты, камера на стойках, эскиз на грани, экспорт, снимок", async () => {
    test.setTimeout(10 * 60_000);

    await test.step("проект, открытие и capabilities", async () => {
      await cad.openNewProject("e2e-mcp-maixcam");
      const capabilities = await cad.json<{ version: number; ops: { op: string }[] }>("cad_capabilities");
      expect(capabilities.version).toBe(1);
      expect(capabilities.ops.map((op) => op.op)).toEqual(expect.arrayContaining(REQUIRED_OPS));
    });

    const pcb = await test.step("текстолит: контур из line и arc с отверстиями, выдавливание 1 мм", async () => {
      const sketch = await cad.sketch({ plane: "XY", entities: pcbSketch() });
      expect(sketch.mode).toBe("model");
      expect(sketch.entityCount).toBe(pcbSketch().length);
      const body = await cad.extrude({ sketchId: sketch.sketchId, distance: PCB.thickness, operation: "new_body" });
      const stats = await cad.stats(body.bodyId);
      expect(stats.openEdges).toBe(0);
      expect(stats.bbox.min[0]).toBeCloseTo(0, 3);
      expect(stats.bbox.min[1]).toBeCloseTo(0, 3);
      expect(stats.bbox.max[0]).toBeCloseTo(PCB.length, 3);
      expect(stats.bbox.max[1]).toBeCloseTo(PCB.width, 3);
      expectLevels(stats.zLevels, PCB_LEVELS, "текстолит");
      const topo = await cad.topology(body.bodyId);
      expect(topo.faces.filter((face) => !face.planar).length, "4 скругления углов и стенки отверстий").toBe(4 + pcbHoles().length);
      return body;
    });

    const board = await test.step("компоненты: цепочка join по targetBodyId и join вниз с reversed", async () => {
      let bodyId = pcb.bodyId;
      for (const part of TOP) {
        const { sketchId } = await cad.sketch({ plane: "XY", entities: [rect(part.x, part.y)] });
        const joined = await cad.extrude({ sketchId, distance: part.h, operation: "join", targetBodyId: bodyId });
        expect(joined.bodyId, `${part.name}: join даёт новое тело`).not.toBe(bodyId);
        bodyId = joined.bodyId;
      }
      const { sketchId } = await cad.sketch({ plane: "XY", entities: [rect(BOTTOM.x, BOTTOM.y)] });
      bodyId = (await cad.extrude({ sketchId, distance: BOTTOM.depth, operation: "join", targetBodyId: bodyId, reversed: true })).bodyId;

      const stats = await cad.stats(bodyId);
      expect(stats.openEdges).toBe(0);
      expectLevels(stats.zLevels, BOARD_LEVELS, "плата с компонентами");
      expect(stats.bbox.min[2]).toBeCloseTo(-BOTTOM.depth, 3);
      expect(stats.bbox.max[0], "USB-C выступает за торец").toBeCloseTo(Math.max(PCB.length, ...TOP.map((part) => part.x[1])), 3);
      const state = await cad.state();
      expect(state.bodies.find((body) => body.id === bodyId)?.visible).toBe(true);
      expect(state.bodies.some((body) => body.id === pcb.bodyId), "исходное тело поглощено join и не числится живым").toBe(false);
      return bodyId;
    });

    const camera = await test.step("камера: выдавить от нуля и срезать низ обратным cut, стойки остаются", async () => {
      const blank = await cad.sketch({ plane: "XY", entities: [rect(CAMERA.boardX, CAMERA.boardY)] });
      const block = await cad.extrude({ sketchId: blank.sketchId, distance: CAMERA.boardTopZ, operation: "new_body" });
      const cut = await cad.sketch({ plane: "XY", entities: cameraCutSketch() });
      const posts = await cad.extrude({
        sketchId: cut.sketchId,
        distance: CAMERA.baseZ,
        operation: "cut",
        targetBodyId: block.bodyId,
        reversed: true,
      });
      const stats = await cad.stats(posts.bodyId);
      expect(stats.openEdges).toBe(0);
      expect(stats.bbox.min[2], "стойки стоят на Z = 0").toBeCloseTo(0, 3);
      expect(stats.bbox.max[2]).toBeCloseTo(CAMERA.boardTopZ, 3);
      expectLevels(stats.zLevels, CAMERA_LEVELS, "камера на стойках");
      const topo = await cad.topology(posts.bodyId);
      const postWalls = topo.faces.filter((face) => !face.planar && face.bbox && face.bbox.max[2] <= CAMERA.baseZ + 1e-3);
      expect(postWalls.length, "две цилиндрические стойки под платой модуля").toBeGreaterThanOrEqual(CAMERA.posts.length);
      return posts.bodyId;
    });

    const cameraFinal = await test.step("эскиз на верхней грани камеры и join держателя", async () => {
      const top = topFace(await cad.topology(camera), CAMERA.boardTopZ);
      const sketch = await cad.sketch({ bodyId: camera, faceId: top.id, entities: [rect(CAMERA.holderX, CAMERA.holderY)] });
      const holder = await cad.extrude({ sketchId: sketch.sketchId, distance: CAMERA.holderH, operation: "join", targetBodyId: camera });
      const stats = await cad.stats(holder.bodyId);
      expect(stats.openEdges).toBe(0);
      expect(stats.bbox.max[2]).toBeCloseTo(CAMERA.holderTopZ, 3);
      expectLevels(stats.zLevels, CAMERA_HOLDER_LEVELS, "камера с держателем");
      const holderTop = topFace(await cad.topology(holder.bodyId), CAMERA.holderTopZ);
      expect(holderTop.bbox!.min[0], "координаты эскиза на грани совпали с мировыми X").toBeCloseTo(CAMERA.holderX[0], 3);
      expect(holderTop.bbox!.max[1], "координаты эскиза на грани совпали с мировыми Y").toBeCloseTo(CAMERA.holderY[1], 3);
      return holder.bodyId;
    });

    await test.step("экспорт: STEP двух тел и STL камеры во временный каталог", async () => {
      const step = await cad.json<{ path: string; bytes: number; mime: string }>("cad_export", {
        format: "step",
        path: `${exportDir}/`,
        body_ids: [board, cameraFinal],
      });
      expect(path.dirname(step.path)).toBe(exportDir);
      expect(step.mime).toBe("application/step");
      const stepBytes = await readFile(step.path);
      expect(stepBytes.length).toBe(step.bytes);
      expect(stepBytes.subarray(0, 13).toString()).toBe("ISO-10303-21;");

      const stlPath = path.join(exportDir, "camera.stl");
      const stl = await cad.json<{ path: string; bytes: number; mime: string }>("cad_export", {
        format: "stl",
        path: stlPath,
        body_ids: [cameraFinal],
      });
      expect(stl).toMatchObject({ path: stlPath, mime: "model/stl" });
      const stlBytes = await readFile(stlPath);
      const triangles = stlBytes.readUInt32LE(80);
      expect(triangles).toBeGreaterThan(0);
      expect(stlBytes.length, "бинарный STL: заголовок и по 50 байт на треугольник").toBe(STL_HEADER_BYTES + triangles * STL_TRIANGLE_BYTES);
    });

    await test.step("снимок вьюпорта", async () => {
      const shot = imageOf(await cad.tool("cad_snapshot"));
      expect(shot.mimeType).toBe("image/png");
      expect(shot.data.startsWith("iVBORw0KGgo")).toBe(true);
    });
  });
});

test.describe("MCP: регрессии из ревью живого рисования", () => {
  test.describe.configure({ mode: "default" });
  let cad: McpCad;

  test.beforeAll(() => {
    cad = McpCad.start();
  });

  test.afterAll(async () => {
    await cad?.stop();
  });

  async function plate(name: string) {
    await cad.openNewProject(name);
    const { sketchId } = await cad.sketch({ plane: "XY", entities: [rect([0, 30], [0, 20])] });
    return cad.extrude({ sketchId, distance: 2 });
  }

  async function expectHonestUndo(before: EditorState) {
    const reply = await cad.reply<{ scope: string }>("history.undo");
    const after = await cad.state();
    if (reply.ok) {
      expect(lastEntries(after), `undo ответил ok: ${JSON.stringify(reply.result)}`).toEqual(lastEntries(before).slice(0, -1));
    } else {
      expect(reply.error?.code).toBe("operation_failed");
      expect(lastEntries(after), "отказ undo не меняет историю").toEqual(lastEntries(before));
    }
    return { reply, after };
  }

  test("предусловие регрессий: MCP открывает проект и строит тело", async () => {
    test.setTimeout(4 * 60_000);
    const body = await plate("e2e-mcp-precondition");
    expect((await cad.stats(body.bodyId)).openEdges).toBe(0);
  });

  test("undo сразу после sketch.create откатывает эскиз или честно отказывает", issue("Баги, п. 1, случай А"), async () => {
    test.setTimeout(4 * 60_000);
    await plate("e2e-mcp-undo-sketch");
    const stray = await cad.sketch({ plane: "XY", entities: [rect([40, 50], [0, 10])] });
    const before = await cad.state();
    expect(before.sketches.find((sketch) => sketch.id === stray.sketchId)?.used).toBe(false);
    const { reply, after } = await expectHonestUndo(before);
    if (reply.ok) expect(after.sketches.map((sketch) => sketch.id)).not.toContain(stray.sketchId);
  });

  test("undo после цепочки extrude join реально откатывает timeline на каждом ok", issue("Баги, п. 1, случай Б"), async () => {
    test.setTimeout(4 * 60_000);
    await cad.openNewProject("e2e-mcp-undo-join");
    const sketches = [];
    for (const entities of [[rect([0, 30], [0, 20])], [rect([2, 8], [2, 8])], [rect([12, 18], [2, 8])]]) {
      sketches.push((await cad.sketch({ plane: "XY", entities })).sketchId);
    }
    let bodyId = (await cad.extrude({ sketchId: sketches[0], distance: 1 })).bodyId;
    const chain = [bodyId];
    for (const [index, sketchId] of sketches.slice(1).entries()) {
      bodyId = (await cad.extrude({ sketchId, distance: 2 + index, operation: "join", targetBodyId: bodyId })).bodyId;
      chain.push(bodyId);
    }

    for (const restored of [chain[1], chain[0]]) {
      const before = await cad.state();
      const { reply, after } = await expectHonestUndo(before);
      expect(reply.ok, "отмена join должна пройти: до неё в истории есть только операции").toBe(true);
      expect(visibleBodies(after), "после отмены видно предыдущее тело цепочки").toEqual([restored]);
    }
  });

  test("эскиз на торце цилиндра получает кромку окружностью, а не десятками отрезков", issue("Баги, п. 3"), async () => {
    test.setTimeout(4 * 60_000);
    await cad.openNewProject("e2e-mcp-face-circle");
    const { sketchId } = await cad.sketch({ plane: "XY", entities: [circle(0, 0, 6)] });
    const rod = await cad.extrude({ sketchId, distance: 5 });
    const top = topFace(await cad.topology(rod.bodyId), 5);
    const onFace = await cad.sketch({ bodyId: rod.bodyId, faceId: top.id, entities: [circle(0, 0, 3)] });
    expect(onFace.entityCount, "одна окружность кромки грани и одна своя").toBeLessThanOrEqual(3);
  });

  test.fail("после reversed в params хранится модуль distance и флаг reversed", issue("Баги, п. 4, знак distance"), async () => {
    test.setTimeout(4 * 60_000);
    await cad.openNewProject("e2e-mcp-reversed");
    const { sketchId } = await cad.sketch({ plane: "XY", entities: [rect([0, 10], [0, 10])] });
    const flipped = await cad.extrude({ sketchId, distance: 1.5, reversed: true });
    const stats = await cad.stats(flipped.bodyId);
    expect(stats.bbox.min[2], "тело ушло вниз").toBeCloseTo(-1.5, 3);
    const entry = (await cad.state()).timeline.find((candidate) => candidate.id === flipped.id);
    for (const params of [flipped.params, entry?.params]) {
      expect(params).toMatchObject({ distance: 1.5, reversed: true });
    }
  });
});
