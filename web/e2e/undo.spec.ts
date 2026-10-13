import { test, expect } from "@playwright/test";
import { CadEditor, edgesAtZ } from "./helpers/cad";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

test.use({ storageState: { cookies: [], origins: [] } });

async function newProject(page: import("@playwright/test").Page) {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();
  const created = await page.request.post("/api/projects/", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { name: `e2e-undo-${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  return { projectId: (await created.json()).id, token: access_token };
}

/** Создать пустой эскиз через API, чтобы не кликать плоскость в 3D-сцене. */
async function seedSketch(
  page: import("@playwright/test").Page,
  projectId: string,
  token: string,
) {
  const sketchId = "sketch-e2e-undo";
  const res = await page.request.put(`/api/projects/${projectId}/document`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      components: {
        [sketchId]: { type: "sketch", plane: "XY", plane_offset: 0, entities: [], constraints: [] },
      },
      timeline: [
        {
          id: "tl-e2e-undo",
          timestamp: new Date().toISOString(),
          kind: "sketch",
          label: "Эскиз 1",
          sketch_id: sketchId,
          params: {},
          status: "ok",
        },
      ],
      version: 1,
    },
  });
  expect(res.ok()).toBeTruthy();
}

/** Draw a rectangle on the sketch canvas by dragging. */
async function drawRectangle(page: import("@playwright/test").Page, dx: number) {
  // Последняя канва — эскизная (первая принадлежит 3D-вьюпорту).
  const canvas = page.locator("canvas").last();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dx / 2, { steps: 8 });
  await page.mouse.up();
}

test("Ctrl+Z в эскизе отменяет геометрию эскиза, а не операцию модели", async ({ page }) => {
  const { projectId, token } = await newProject(page);
  await seedSketch(page, projectId, token);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`/editor/${projectId}`);
  await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible();

  // Открыть существующий эскиз из дерева: выбор плоскости идёт кликом по 3D-сцене.
  await page.getByText("Эскизы").click();
  await page.getByTestId("timeline-node").filter({ hasText: "Эскиз 1" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Редактировать эскиз" }).click();
  await expect(page.locator("[data-sketch-ui]")).toBeVisible();

  // Кнопка эскиза, а не риббона модели: обе называются «Отменить».
  const undoBtn = page
    .locator("[data-sketch-ui]")
    .getByRole("button", { name: "Отменить", exact: true });
  await expect(undoBtn).toBeVisible();
  // В новом эскизе отменять нечего.
  await expect(undoBtn).toBeDisabled();

  await page.locator("[data-sketch-ui]").getByRole("button", { name: "Прямоуг." }).click();
  await drawRectangle(page, 120);

  // Появилась геометрия — кнопка «Отменить» ожила.
  await expect(undoBtn).toBeEnabled();

  await page.keyboard.press("Control+z");

  // Регрессия: Ctrl+Z проваливался в историю фич модели и не трогал эскиз.
  await expect(undoBtn).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

test("Ctrl+Z в новом эскизе после выдавливания сохраняет операцию модели", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-after-extrude-undo");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-20, -20, 40, 40);
  await cad.finishSketch();
  await cad.extrude({ distance: 20, direction: "symmetric" });
  expect(await cad.visibleBodyCount()).toBe(1);
  const beforeTimeline = await cad.timeline();
  expect(beforeTimeline.some((entry) => entry.kind === "extrude")).toBe(true);

  await cad.startSketchOnFace([80, 80, 80], [[0, 0, 10], [8, 8, 10], [-8, -8, 10]]);
  const baseline = (await cad.sketchEntities()).length;
  await cad.drawRect(-12, -12, 5, 5);
  const afterFirst = (await cad.sketchEntities()).length;
  await cad.drawRect(7, 7, 5, 5);
  expect((await cad.sketchEntities()).length).toBeGreaterThan(afterFirst);
  expect(afterFirst).toBeGreaterThan(baseline);

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await cad.sketchEntities()).length).toBe(afterFirst);
  expect(await cad.timeline()).toEqual(beforeTimeline);
  expect(await cad.visibleBodyCount()).toBe(1);
});

test("Ctrl+Z в модели не помечает документ грязным (не откатывает после перезагрузки)", async ({ page }) => {
  const { projectId, token } = await newProject(page);

  await page.goto(`/editor/${projectId}`);
  await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible();

  // В пустом проекте отменять нечего — undo не должен ничего портить.
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Отменять нечего")).toBeVisible();

  // Документ на сервере не должен быть перезаписан пустым снимком из памяти.
  const doc = await page.request.get(`/api/projects/${projectId}/document`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(doc.ok()).toBeTruthy();
  const body = await doc.json();
  expect(body.version).toBeLessThanOrEqual(2);
});

test("кнопки «Отменить»/«Повторить» есть в риббоне модели", async ({ page }) => {
  const { projectId } = await newProject(page);

  await page.goto(`/editor/${projectId}`);
  await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible();

  // Обнаруживаемость: раньше отмена была только на Ctrl+Z и нигде не показывалась.
  const ribbonUndo = page.getByTestId("ribbon-undo");
  await expect(ribbonUndo).toBeVisible();
  await expect(page.getByTestId("ribbon-redo")).toBeVisible();
  await expect(ribbonUndo).toBeDisabled();

  // Дубль тех же кнопок в таймлайне убран — «Отменить» на экране ровно одна.
  await expect(page.getByRole("button", { name: "Отменить", exact: true })).toHaveCount(1);
});


test("отмена скругления убирает его из сцены, а не только из дерева", async ({ page }) => {
  test.setTimeout(10 * 60_000);

  // Скругление, фаска и резьба мутируют тело на месте: .brep и .mesh
  // перезаписываются под тем же body_id. Откат одного лишь документа оставлял
  // в сцене геометрию отменённой операции — дерево показывало куб без
  // скругления, а на экране оно оставалось, и расхождение переживало
  // перезагрузку страницы.
  const cad = await CadEditor.open(page, "e2e-fillet-undo");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-20, -20, 40, 40);
  await cad.finishSketch();
  await cad.extrude({ distance: 20, direction: "symmetric" });

  const before = await cad.topology();
  expect(before.faces, "куб из шести граней").toBe(6);

  const rim = edgesAtZ(before, 10);
  expect(rim.length, "верхняя кромка куба").toBeGreaterThan(0);
  await cad.fillet([rim[0].id], 3);

  const filleted = await cad.topology();
  expect(filleted.faces, "скругление добавило грань").toBeGreaterThan(before.faces);

  await page.getByTestId("ribbon-undo").dispatchEvent("click");
  await expect
    .poll(async () => (await cad.topology()).faces, { timeout: 90000 })
    .toBe(before.faces);

  expect(
    (await cad.timeline()).filter((t) => t.kind === "fillet"),
    "запись скругления ушла из дерева",
  ).toHaveLength(0);
});
