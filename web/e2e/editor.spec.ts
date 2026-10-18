import { test, expect } from "@playwright/test";
import { expectEditorOpen } from "./helpers/cad";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

// Свой логин через page.request (общий cookie jar с браузером): переиспользование
// refresh-cookie из storageState параллельно со smoke-тестом ловит replay-защиту
// ротации токенов и роняет обе сессии.
test.use({ storageState: { cookies: [], origins: [] } });

test("редактор открывается: дерево, риббон, пустое состояние, статус-бар", async ({ page }) => {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();

  const created = await page.request.post("/api/projects/", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { name: `e2e-editor-${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).id;

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`/editor/${projectId}`);

  await expectEditorOpen(page);
  await expect(page.getByRole("button", { name: "Эскиз", exact: true })).toBeVisible();
  await expect(page.getByText("Начните с эскиза")).toBeVisible();
  await expect(page.getByText("Ядро готово")).toBeVisible();
  await expect(page.getByText("0 операций")).toBeVisible();

  await page.getByTestId("ribbon-sketch").dispatchEvent("click");
  await expect(page.getByText("Кликните базовую плоскость или плоскую грань тела")).toBeVisible();
  await page.getByRole("button", { name: "Отмена (Esc)" }).dispatchEvent("click");
  await expect(page.getByText("Начните с эскиза")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
