import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, errorCode, near, readStl, rect, sceneBodies, type ExportedFile, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

test("канал: резьба, вращение и булева операция", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-control-features");

  const rodSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [circle(0, 0, 6)] });
  const rod = await cad.control<Feature>("extrude", { sketchId: rodSketch.sketchId, distance: 30 });
  const rodTopo = await cad.control<Topo>("topology", { bodyId: rod.feature.bodyId });
  const side = rodTopo.faces.filter((face) => !face.planar).sort((a, b) => b.area - a.area)[0];
  const cap = rodTopo.faces.find((face) => face.planar)!;

  const flat = await cad.request("thread", { bodyId: rod.feature.bodyId, faceId: cap.id, pitch: 1.5 });
  expect(flat, "плоская грань под резьбу не годится").toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  const thread = await cad.control<Feature>("thread", { bodyId: rod.feature.bodyId, faceId: side.id, pitch: 1.5, length: 18 });
  expect(thread.feature.kind).toBe("thread");
  expect(thread.feature.params).toMatchObject({ pitch: 1.5 });
  expect(await sceneBodies(cad)).toEqual([thread.feature.bodyId]);
  const threaded = await cad.control<Topo>("topology", { bodyId: thread.feature.bodyId });
  expect(threaded.faces.length).toBeGreaterThan(rodTopo.faces.length);

  const ringSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(10, 0, 20, 10)] });
  const ring = await cad.control<Feature>("revolve", { sketchId: ringSketch.sketchId, axis: "y", angle: 360 });
  expect(ring.feature.kind).toBe("revolve");
  const ringTopo = await cad.control<Topo>("topology", { bodyId: ring.feature.bodyId });
  expect(ringTopo.bbox.max[0]).toBeCloseTo(20, 1);
  expect(ringTopo.bbox.min[0]).toBeCloseTo(-20, 1);
  expect(ringTopo.bbox.max[1] - ringTopo.bbox.min[1]).toBeCloseTo(10, 2);
  expect(await sceneBodies(cad)).toHaveLength(2);

  const barSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(-25, 2, 25, 8)] });
  const bar = await cad.control<Feature>("extrude", { sketchId: barSketch.sketchId, distance: 10, direction: "symmetric" });
  expect(bar.feature.params).toMatchObject({ operation: "new_body" });
  expect(await sceneBodies(cad)).toHaveLength(3);

  expect(await errorCode(cad, "boolean", { operation: "union", targetBodyId: ring.feature.bodyId, toolBodyId: ring.feature.bodyId })).toBe("invalid_params");
  const union = await cad.control<Feature>("boolean", {
    operation: "union",
    targetBodyId: ring.feature.bodyId,
    toolBodyId: bar.feature.bodyId,
  });
  expect(union.feature.kind).toBe("boolean");
  expect(union.mode).toBe("model");
  const visible = await sceneBodies(cad);
  expect(visible.sort()).toEqual([thread.feature.bodyId, union.feature.bodyId].sort());
  const unionTopo = await cad.control<Topo>("topology", { bodyId: union.feature.bodyId });
  expect(unionTopo.bbox.max[0]).toBeCloseTo(25, 1);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: union.feature.bodyId })).openEdges).toBe(0);

  const state = await cad.control<{ bodies: { id: string; visible: boolean }[]; timeline: { kind: string }[] }>("state");
  expect(state.bodies.filter((body) => body.visible).map((body) => body.id).sort()).toEqual(visible.sort());
  expect(state.timeline.map((entry) => entry.kind)).toEqual(["sketch", "extrude", "thread", "sketch", "revolve", "sketch", "extrude", "boolean"]);
  expect((await cad.timeline()).map((entry) => entry.kind)).toEqual(state.timeline.map((entry) => entry.kind));

  const together = readStl(await cad.control<ExportedFile>("export", { format: "stl" }));
  const parts = [];
  for (const bodyId of visible) parts.push(await cad.control<ExportedFile>("export", { format: "stl", bodyIds: [bodyId] }));
  expect(new Set(parts.map((part) => part.filename)).size, "у каждого тела свой файл").toBe(2);
  expect(parts.map((part) => readStl(part).triangles).reduce((sum, count) => sum + count, 0), "по телу на файл — в сумме вся модель").toBe(
    together.triangles,
  );
  const pair = await cad.control<ExportedFile>("export", { format: "step", bodyIds: visible });
  expect(pair.filename).toMatch(/-Тело \d+\+Тело \d+\.step$/);
  expect(Buffer.from(pair.dataBase64, "base64").subarray(0, 13).toString()).toBe("ISO-10303-21;");

  expect(pageErrors).toEqual([]);
});

test("канал: пределы и стороны выдавливания, необязательные параметры операций", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-control-extents");
  const sketchOn = async (plane: string, entities: unknown[]) =>
    (await cad.control<{ sketchId: string }>("sketch.create", { plane, entities })).sketchId;
  const bboxOf = async (bodyId: string) => (await cad.control<Topo>("topology", { bodyId })).bbox;

  const plate = await cad.control<Feature>("extrude", { sketchId: await sketchOn("XY", [rect(-20, -20, 20, 20)]), distance: 10 });

  const holeSketch = await sketchOn("XY", [circle(10, 10, 4)]);
  expect(await errorCode(cad, "extrude", { sketchId: holeSketch })).toBe("invalid_params");
  expect(await errorCode(cad, "extrude", { sketchId: holeSketch, extent: "up_to_face" })).toBe("invalid_params");
  expect(await errorCode(cad, "extrude", { sketchId: holeSketch, extent: "up_to_body" })).toBe("invalid_params");
  const cutAway = { sketchId: holeSketch, operation: "cut", targetBodyId: plate.feature.bodyId, extent: "through_all" };
  const away = await cad.request("extrude", cutAway);
  expect(away, "вырез в сторону от тела объясняет, что делать").toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect((away as { error: { message: string } }).error.message).toMatch(/Реверс/);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  const hole = await cad.control<Feature>("extrude", { ...cutAway, reversed: true });
  const holed = await cad.control<Topo>("topology", { bodyId: hole.feature.bodyId });
  expect(holed.faces, "сквозное отверстие добавило одну стенку").toHaveLength(7);
  expect(holed.bbox.max[2] - holed.bbox.min[2]).toBeCloseTo(10, 3);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: hole.feature.bodyId })).openEdges).toBe(0);

  const twoSided = await cad.control<Feature>("extrude", {
    sketchId: await sketchOn("XY", [rect(40, -5, 50, 5)]),
    distance: 5,
    direction: "two_sided",
    backDistance: 3,
  });
  const twoSidedBox = await bboxOf(twoSided.feature.bodyId);
  expect(twoSidedBox.min[2]).toBeCloseTo(-3, 3);
  expect(twoSidedBox.max[2]).toBeCloseTo(5, 3);

  const flipped = await cad.control<Feature>("extrude", {
    sketchId: await sketchOn("XY", [rect(40, 10, 50, 20)]),
    distance: 4,
    reversed: true,
  });
  const flippedBox = await bboxOf(flipped.feature.bodyId);
  expect(flippedBox.min[2]).toBeCloseTo(-4, 3);
  expect(flippedBox.max[2]).toBeCloseTo(0, 3);

  const boss = await cad.control<Feature>("extrude", {
    sketchId: await sketchOn("XY", [rect(-20, -20, -10, -10)]),
    distance: 15,
    operation: "join",
    targetBodyId: hole.feature.bodyId,
  });
  expect(boss.feature.params).toMatchObject({ operation: "join" });
  const bossTopo = await cad.control<Topo>("topology", { bodyId: boss.feature.bodyId });
  expect(bossTopo.bbox.max[2]).toBeCloseTo(15, 3);
  expect(await sceneBodies(cad), "приклеивание не плодит видимых тел").toHaveLength(3);

  const bossTop = bossTopo.faces.find((face) => face.planar && face.normal?.[2] === 1 && near(face.bbox!.min[2], 15))!;
  const post = await cad.control<Feature>("extrude", {
    sketchId: await sketchOn("XY", [circle(60, 0, 3)]),
    extent: "up_to_face",
    upToBodyId: boss.feature.bodyId,
    upToFaceId: bossTop.id,
  });
  const postBox = await bboxOf(post.feature.bodyId);
  expect(postBox.min[2]).toBeCloseTo(0, 3);
  expect(postBox.max[2], "столбик дорос до верхней грани бобышки").toBeCloseTo(15, 3);

  const beam = await cad.control<Feature>("extrude", {
    sketchId: await sketchOn("YZ", [circle(0, 2, 1.5)]),
    extent: "up_to_body",
    upToBodyId: twoSided.feature.bodyId,
    offset: -5,
  });
  const beamBox = await bboxOf(beam.feature.bodyId);
  expect(beamBox.min[0]).toBeCloseTo(0, 3);
  expect(beamBox.max[0], "балка не дошла до тела на отступ 5 мм").toBeCloseTo(35, 3);

  const quarter = await cad.control<Feature>("revolve", {
    sketchId: await sketchOn("XY", [rect(70, 0, 80, 10)]),
    axis: "x",
    axisOrigin: [0, -5],
    angle: 90,
  });
  const quarterBox = await bboxOf(quarter.feature.bodyId);
  expect(quarterBox.min[0]).toBeCloseTo(70, 2);
  expect(quarterBox.max[0]).toBeCloseTo(80, 2);
  expect(Math.max(Math.abs(quarterBox.min[2]), Math.abs(quarterBox.max[2])), "четверть оборота вокруг оси y = -5").toBeCloseTo(15, 1);

  const wedge = await cad.control<Feature>("revolve", {
    sketchId: await sketchOn("XY", [rect(90, 30, 100, 40)]),
    axis: "y",
    angle: 60,
    direction: "symmetric",
  });
  const wedgeBox = await bboxOf(wedge.feature.bodyId);
  expect(wedgeBox.max[2]).toBeCloseTo(50, 1);
  expect(wedgeBox.min[2], "симметричное вращение уходит поровну в обе стороны").toBeCloseTo(-50, 1);

  const flippedTopo = await cad.control<Topo>("topology", { bodyId: flipped.feature.bodyId });
  const uneven = await cad.control<Feature>("chamfer", {
    bodyId: flipped.feature.bodyId,
    edgeIds: [flippedTopo.edges[0].id],
    distance: 1,
    distance2: 2,
  });
  expect(uneven.feature.params).toMatchObject({ distance1: 1, distance2: 2 });
  expect((await cad.control<Topo>("topology", { bodyId: uneven.feature.bodyId })).faces).toHaveLength(7);

  const rod = await cad.control<Feature>("extrude", { sketchId: await sketchOn("XY", [circle(130, 0, 6)]), distance: 30 });
  const rodTopo = await cad.control<Topo>("topology", { bodyId: rod.feature.bodyId });
  const side = rodTopo.faces.filter((face) => !face.planar).sort((a, b) => b.area - a.area)[0];
  const jar = await cad.control<Feature>("thread", {
    bodyId: rod.feature.bodyId,
    faceId: side.id,
    pitch: 2,
    depth: 0.8,
    length: 12,
    offset: 3,
    crestRatio: 0.3,
    starts: 2,
    leftHanded: true,
  });
  expect(jar.feature.params).toMatchObject({ pitch: 2, depth: 0.8, length: 12, offset: 3, starts: 2, right_handed: false });
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: jar.feature.bodyId })).openEdges).toBe(0);

  const visible = await sceneBodies(cad);
  const state = await cad.control<{ bodies: { id: string; visible: boolean }[] }>("state");
  expect(state.bodies.filter((body) => body.visible).map((body) => body.id).sort(), "сцена и документ согласны").toEqual([...visible].sort());
  expect(visible).toHaveLength(8);

  expect(pageErrors).toEqual([]);
});
