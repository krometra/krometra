import { test, expect } from "@playwright/test";
import { expectEditorOpen } from "./helpers/cad";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

// Свой логин через page.request (общий cookie jar с браузером): переиспользование
// refresh-cookie из storageState параллельно с другими спеками ловит replay-защиту.
test.use({ storageState: { cookies: [], origins: [] } });

async function openProjectWithSketch(page: import("@playwright/test").Page) {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();
  const auth = { Authorization: `Bearer ${access_token}` };

  const created = await page.request.post("/api/projects/", {
    headers: auth,
    data: { name: `e2e-revolve-${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).id;

  // Профиль, смещённый от оси вращения, — при вращении даёт кольцо/трубу.
  const sketchId = "sketch-e2e-revolve";
  const corners = [
    [10, 0],
    [20, 0],
    [20, 10],
    [10, 10],
  ];
  const entities = corners.map((c, i) => ({
    id: `sketch-entity-rev-${i}`,
    type: "line",
    start: { x: c[0], y: c[1] },
    end: { x: corners[(i + 1) % 4][0], y: corners[(i + 1) % 4][1] },
  }));

  const saved = await page.request.put(`/api/projects/${projectId}/document`, {
    headers: auth,
    data: {
      components: {
        [sketchId]: {
          type: "sketch",
          plane: "XY",
          plane_offset: 0,
          entities,
          constraints: [],
        },
      },
      timeline: [
        {
          id: "tl-e2e-revolve",
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

  return projectId;
}

test("кнопка «Вращать» открывает параметры вращения, а не выдавливания", async ({ page }) => {
  const projectId = await openProjectWithSketch(page);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`/editor/${projectId}`);
  await expectEditorOpen(page);

  await page.getByRole("button", { name: "Вращать", exact: true }).first().click();

  // Регрессия: кнопка «Вращать» запускала выдавливание — открывались
  // ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ, а поля угла/оси не показывались вовсе.
  await expect(page.getByText("ПАРАМЕТРЫ ВРАЩЕНИЯ")).toBeVisible();
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0);
  await expect(page.getByText("Угол", { exact: true })).toBeVisible();
  await expect(page.getByText("Ось вращения")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("кнопка «Выдавить» открывает параметры выдавливания без полей вращения", async ({ page }) => {
  const projectId = await openProjectWithSketch(page);

  await page.goto(`/editor/${projectId}`);
  await expectEditorOpen(page);

  await page.getByRole("button", { name: "Выдавить", exact: true }).first().click();

  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  await expect(page.getByText("ПАРАМЕТРЫ ВРАЩЕНИЯ")).toHaveCount(0);
  await expect(page.getByText("Расстояние", { exact: true })).toBeVisible();
});

test("вращение строит тело, видимое в сцене без перезагрузки страницы", async ({ page }) => {
  const projectId = await openProjectWithSketch(page);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`/editor/${projectId}`);
  await expectEditorOpen(page);
  await expect(page.getByText("Начните с эскиза")).toHaveCount(0);

  await page.getByRole("button", { name: "Вращать", exact: true }).first().click();
  await expect(page.getByText("ПАРАМЕТРЫ ВРАЩЕНИЯ")).toBeVisible();

  await page.getByRole("button", { name: "Вращать", exact: true }).last().click();

  // Приёмка мутирующей операции (AGENTS.md): результат виден сразу,
  // без перезагрузки — тело появляется в дереве модели и в счётчике операций.
  await expect(page.getByText("1 операция")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("ПАРАМЕТРЫ ВРАЩЕНИЯ")).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});
