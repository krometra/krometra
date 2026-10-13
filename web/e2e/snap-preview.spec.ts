import { test, expect, type Page } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Приёмка ROADMAP, Фаза C: «Привязка не видна до клика».
 *
 * Измерение из ROADMAP (19.08.2026): считались жёлтые пиксели маркера вокруг
 * угла прямоугольника при активном инструменте «Окружность». Было: курсор в
 * пустоте — 0, курсор ровно на углу БЕЗ клика — **0** (маркера нет физически),
 * тот же угол при зажатой кнопке во время рисования — 68.
 *
 * Здесь повторяем ту же пробу: маркер обязан гореть ДО первого клика.
 */
async function openNewSketch(page: Page) {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok(), "логин").toBeTruthy();

  const created = await page.request.post("/api/projects/", {
    headers: { Authorization: `Bearer ${(await login.json()).access_token}` },
    data: { name: `e2e-snap-${Date.now()}` },
  });
  expect(created.ok(), "создание проекта").toBeTruthy();

  await page.goto(`/editor/${(await created.json()).id}`);
  await page.getByTestId("ribbon-sketch").dispatchEvent("click");
  const viewport = page.locator("canvas").first();
  const box = await viewport.boundingBox();
  if (!box) throw new Error("вьюпорт не виден");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 40);
  await expect(page.getByRole("button", { name: /Окруж/ })).toBeVisible();
}

const canvas = (page: Page) => page.locator("canvas").last();

async function clickTool(page: Page, prefix: string) {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().startsWith(text),
    );
    if (!btn) throw new Error(`инструмент «${text}» не найден`);
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, prefix);
  await page.waitForTimeout(300);
}

/**
 * Пиксели маркера привязки на канвасе скетчера.
 *
 * Цвет проверяем узко — ровно `rgba(255, 215, 0, …)` маркера. Широкий фильтр
 * («красный высокий, синий низкий») ловил антиалиасинг обычных линий эскиза
 * и давал ложно-зелёный тест: спека проходила даже с отключённым фиксом.
 */
async function markerPixels(page: Page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("canvas")].pop() as HTMLCanvasElement | undefined;
    if (!el) return -1;
    const ctx = el.getContext("2d");
    if (!ctx) return -1;
    const data = ctx.getImageData(0, 0, el.width, el.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [red, green, blue, alpha] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (alpha > 80 && red > 240 && green > 195 && green < 235 && blue < 60) count++;
    }
    return count;
  });
}

test("маркер привязки виден под курсором ДО первого клика", async ({ page }) => {
  await openNewSketch(page);

  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("канвас скетчера не виден");

  // Рисуем прямоугольник мышью: его углы и станут целью привязки.
  const corner1: [number, number] = [box.x + box.width * 0.35, box.y + box.height * 0.35];
  const corner2: [number, number] = [box.x + box.width * 0.62, box.y + box.height * 0.62];

  await clickTool(page, "Прямоуг");
  await page.mouse.move(...corner1);
  await page.mouse.down();
  await page.mouse.move(...corner2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Инструмент «Окружность»: до первого клика он выходит по `if (this.drawing)`,
  // из-за чего привязка раньше вообще не считалась.
  await clickTool(page, "Окруж");

  // 1. Курсор в пустоте — маркера быть не должно.
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.85);
  await page.waitForTimeout(300);
  expect(await markerPixels(page), "в пустоте маркера быть не должно").toBe(0);

  // 2. Курсор ровно на углу БЕЗ клика: раньше здесь было 0 — маркера не существовало.
  await page.mouse.move(corner2[0], corner2[1]);
  await page.waitForTimeout(400);
  expect(
    await markerPixels(page),
    "маркер привязки должен гореть на углу ДО клика (в ROADMAP замерено 0)",
  ).toBeGreaterThan(0);

  // 3. Второй угол ловится так же — это не случайное попадание в одну точку.
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.85);
  await page.waitForTimeout(300);
  await page.mouse.move(corner1[0], corner1[1]);
  await page.waitForTimeout(400);
  expect(
    await markerPixels(page),
    "маркер должен гореть и на противоположном угле",
  ).toBeGreaterThan(0);
});
