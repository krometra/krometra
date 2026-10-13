import { test, expect, type Page } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

test.use({ storageState: { cookies: [], origins: [] } });

async function openSketch(page: Page): Promise<{ projectId: string; token: string }> {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();

  const created = await page.request.post("/api/projects/", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { name: `e2e-sketch-${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).id;

  await page.goto(`/editor/${projectId}`);
  await page.getByTestId("ribbon-sketch").dispatchEvent("click");
  // Плоскость XY выбирается кликом по её хелперу в центре вьюпорта
  const viewport = page.locator("canvas").first();
  const box = await viewport.boundingBox();
  if (!box) throw new Error("viewport not visible");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 40);
  await expect(page.getByRole("button", { name: /Окруж/ })).toBeVisible();
  return { projectId, token: access_token };
}

async function sketchIdOf(page: Page, projectId: string, token: string): Promise<string> {
  const doc = await page.request.get(`/api/projects/${projectId}/document`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(doc.ok()).toBeTruthy();
  const body = await doc.json();
  const components: Record<string, { plane?: string; entities?: unknown[] }> =
    body.components ?? body.document?.components ?? {};
  const sketchId = Object.entries(components).find(
    ([, v]) => v && typeof v === "object" && "plane" in v && "entities" in v
  )?.[0];
  if (!sketchId) throw new Error(`нет эскиза в документе: ${JSON.stringify(body).slice(0, 600)}`);
  return sketchId!;
}

function objectCount(page: Page) {
  return page.locator("text=шт").locator("..").locator("span").first();
}

function canvas(page: Page) {
  return page.locator("canvas").last();
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("canvas not visible");
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
}

test("радиус вводится во всплывающем поле с автофокусом", async ({ page }) => {
  const { projectId, token } = await openSketch(page);

  await page.getByRole("button", { name: /Окруж/ }).click();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + 300, box.y + 300);

  // Поле появилось после первого клика и уже сфокусировано — можно печатать сразу
  const radiusField = page.locator('[data-sketch-ui] input[inputmode="decimal"]');
  await expect(radiusField).toBeFocused();
  await page.keyboard.type("12.5");
  await page.keyboard.press("Enter");

  const put = page.waitForResponse(
    (r) => r.url().includes("/sketches/") && r.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "ОК", exact: true }).click();
  expect((await put).ok()).toBeTruthy();

  const sketchId = await sketchIdOf(page, projectId, token);
  const saved = await page.request.get(`/api/projects/${projectId}/sketches/${sketchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await saved.json();
  const radii = data.entities
    .filter((e: { type: string }) => e.type === "circle")
    .map((e: { radius: number }) => e.radius);
  expect(radii, JSON.stringify(data.entities)).toContainEqual(expect.closeTo(12.5, 1));
});

test("у прямоугольника поле ширины сфокусировано сразу после первого клика", async ({ page }) => {
  await openSketch(page);
  await page.getByRole("button", { name: /Прямоуг/ }).click();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + 250, box.y + 250);
  await expect(page.locator('[data-sketch-ui] input[inputmode="decimal"]').first()).toBeFocused();
});

test("маленькая окружность рисуется, центр даёт привязку, радиус правится в панели", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const { projectId, token } = await openSketch(page);

  await page.getByRole("button", { name: /Окруж/ }).click();
  // Радиус ~6 экранных пикселей — раньше отсекалось порогом 3 мм в мировых единицах
  await drag(page, [300, 300], [306, 300]);
  await expect(page.getByText(/ОБЪЕКТОВ/)).toBeVisible();
  await expect(objectCount(page)).toHaveText("1");

  // Привязка: вторая окружность стартует рядом с центром первой и цепляется к нему
  await drag(page, [303, 302], [360, 300]);
  await expect(objectCount(page)).toHaveText("2");

  // Выбираем окружность и задаём радиус
  await page.getByRole("button", { name: "Выбор" }).click();
  await page.mouse.click(await xOf(page, 360), await yOf(page, 300));
  await expect(page.getByText(/Выбрано: 1/)).toBeVisible();
  await page.getByRole("button", { name: "R", exact: true }).click();
  await page.getByPlaceholder("Радиус").fill("25");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Радиус")).toBeVisible();
  await expect(page.locator('input[inputmode="decimal"]')).toHaveValue("25");

  // Приёмка: значение доходит до решателя и сохраняется в документ
  const saveResponse = page.waitForResponse(
    (r) => r.url().includes("/sketches/") && r.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "ОК", exact: true }).click();
  expect((await saveResponse).ok()).toBeTruthy();
  const saved = await page.request.get(
    `/api/projects/${projectId}/sketches/${await sketchIdOf(page, projectId, token)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(saved.ok()).toBeTruthy();
  const data = await saved.json();
  const radii = data.entities.filter((e: { type: string }) => e.type === "circle").map((e: { radius: number }) => e.radius);
  expect(radii, JSON.stringify(data.entities)).toContainEqual(expect.closeTo(25, 1));

  expect(pageErrors).toEqual([]);
});

async function xOf(page: Page, x: number) {
  const box = await canvas(page).boundingBox();
  return (box?.x ?? 0) + x;
}
async function yOf(page: Page, y: number) {
  const box = await canvas(page).boundingBox();
  return (box?.y ?? 0) + y;
}
