import { expect, test, type Locator, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1200, height: 900 },
});

async function expectButtonsInsideToolbar(page: Page, toolbar: Locator) {
  const container = await toolbar.boundingBox();
  expect(container, "тулбар виден").not.toBeNull();
  const buttons = toolbar.getByRole("button");
  expect(await buttons.count()).toBeGreaterThan(0);

  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    const label = (await button.getAttribute("title")) ?? (await button.textContent())?.trim();
    expect(box, `кнопка ${label} видна`).not.toBeNull();
    expect(box!.width, `ширина кнопки ${label}`).toBeGreaterThan(0);
    expect(box!.height, `высота кнопки ${label}`).toBeGreaterThan(0);
    expect(box!.x, `${label}: левый край`).toBeGreaterThanOrEqual(container!.x - 1);
    expect(box!.y, `${label}: верхний край`).toBeGreaterThanOrEqual(container!.y - 1);
    expect(box!.x + box!.width, `${label}: правый край`).toBeLessThanOrEqual(container!.x + container!.width + 1);
    expect(box!.y + box!.height, `${label}: нижний край`).toBeLessThanOrEqual(container!.y + container!.height + 1);
    expect(box!.x + box!.width, `${label}: внутри окна`).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}

async function clickCenter(page: Page, button: Locator) {
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test("тулбары эскиза доступны при 1200 px с открытой панелью свойств", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-toolbar-width");
  await cad.startSketchOnBasePlane();

  const props = page.locator("aside").last();
  await expect(props.getByText("ПЛОСКОСТЬ ЭСКИЗА")).toBeVisible();
  expect((await props.boundingBox())?.width).toBeGreaterThan(0);

  const sketchToolbar = page.locator("[data-sketch-ui]").filter({
    has: page.getByRole("button", { name: "Привязка", exact: true }),
  });
  await expectButtonsInsideToolbar(page, sketchToolbar);

  const snap = sketchToolbar.getByRole("button", { name: "Привязка", exact: true });
  const activeClass = await snap.getAttribute("class");
  const hitTarget = await snap.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit?.closest("button")?.getAttribute("title") ?? `${hit?.tagName}.${hit?.className}`;
  });
  expect(hitTarget, "центр кнопки доступен для клика").toBe("Привязка к вспомогательным прямым и пересечениям");
  await clickCenter(page, snap);
  await expect(snap, "клик по правой кнопке меняет привязку").not.toHaveClass(activeClass!);

  await cad.drawRect(-15, -15, 30, 30);
  await cad.click("Выбор");
  const [x, y] = await cad.sketchPoint([0, -15]);
  await page.mouse.click(x, y);

  const constraintToolbar = page.locator("[data-sketch-ui]").filter({ hasText: "Выбрано: 1" });
  await expect(constraintToolbar).toBeVisible();
  await expectButtonsInsideToolbar(page, constraintToolbar);

  const clear = constraintToolbar.getByRole("button", { name: "✕" });
  await clickCenter(page, clear);
  await expect(constraintToolbar, "крайняя кнопка снимает выделение").toHaveCount(0);
});
