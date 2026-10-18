import { test, expect, type Page } from "@playwright/test";
import { expectEditorOpen } from "./helpers/cad";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

test.use({ storageState: { cookies: [], origins: [] } });

async function openProjectWithSketch(page: Page): Promise<string> {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const auth = { Authorization: `Bearer ${(await login.json()).access_token}` };

  const created = await page.request.post("/api/projects/", {
    headers: auth,
    data: { name: `e2e-panels-${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).id;

  const sketchId = "sketch-e2e-panels";
  const corners = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ];
  const entities = corners.map((c, i) => ({
    id: `sketch-entity-panels-${i}`,
    type: "line",
    start: { x: c[0], y: c[1] },
    end: { x: corners[(i + 1) % 4][0], y: corners[(i + 1) % 4][1] },
  }));

  const saved = await page.request.put(`/api/projects/${projectId}/document`, {
    headers: auth,
    data: {
      components: {
        [sketchId]: { type: "sketch", plane: "XY", plane_offset: 0, entities, constraints: [] },
      },
      timeline: [
        {
          id: "tl-e2e-panels",
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
  expect(saved.ok()).toBeTruthy();

  await page.goto(`/editor/${projectId}`);
  await expectEditorOpen(page);
  return projectId;
}

test("кнопка выдавливания показывает итог и обновляется без Enter", async ({ page }) => {
  await openProjectWithSketch(page);

  await page.getByTestId("ribbon-extrude").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();

  const apply = page.getByTestId("extrude-apply");
  await expect(apply).toHaveText("Выдавить 30 мм");

  // Регрессия: значение применялось только по Enter/blur — нажатие «Выдавить»
  // сразу после ввода уходило со старым расстоянием.
  await page.locator('[inputmode="decimal"]').first().fill("15");
  await expect(apply).toHaveText("Выдавить 15 мм");

  await page.getByRole("combobox").filter({ has: page.locator('option[value="through_all"]') }).selectOption("through_all");
  await expect(apply).toHaveText("Выдавить насквозь");
});

test("другой инструмент закрывает панель выдавливания, а не открывается поверх неё", async ({ page }) => {
  await openProjectWithSketch(page);

  await page.getByTestId("ribbon-extrude").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();

  // Регрессия: редактор оказывался в двух режимах сразу — вьюпорт ждал выбора
  // рёбер, а панель выдавливания продолжала висеть.
  await page.getByTestId("ribbon-sketch").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0);
  await expect(page.getByText("Кликните базовую плоскость или плоскую грань тела")).toBeVisible();
});

test("панель не наследует направление прошлой операции", async ({ page }) => {
  await openProjectWithSketch(page);

  await page.getByTestId("ribbon-extrude").dispatchEvent("click");
  // Панель монтируется асинхронно: под нагрузкой полного прогона selectOption
  // успевал стартовать раньше её появления и падал по таймауту.
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  const direction = page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="symmetric"]') });
  await expect(direction).toBeVisible();
  await direction.selectOption("symmetric");
  await page.getByRole("button", { name: "Отмена (Esc)" }).dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0);

  // Регрессия: «симметрично» утекало в следующую операцию и молча делало
  // карман вдвое мельче.
  await page.getByTestId("ribbon-extrude").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  await expect(direction).toHaveValue("one_side");
});

test("подсказку онбординга в центре вьюпорта можно закрыть", async ({ page }) => {
  await openProjectWithSketch(page);

  const hint = page.getByText("Эскиз готов");
  await expect(hint).toBeVisible();

  // Регрессия: крестик рисовался только для варианта pill, и центральная
  // подсказка висела посреди вьюпорта до конца сеанса.
  await page.getByRole("button", { name: "Скрыть подсказку" }).dispatchEvent("click");
  await expect(hint).toHaveCount(0);
});
