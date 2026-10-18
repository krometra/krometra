import { test, expect, type Browser } from "@playwright/test";

const testUser = {
  id: "e2e-user",
  email: "e2e-agent@example.com",
  display_name: "E2E",
};

async function openLanding(browser: Browser, baseURL: string | undefined, user = testUser) {
  if (!baseURL) throw new Error("E2E_BASE_URL is required.");
  const context = await browser.newContext();
  await context.route("**/api/auth/refresh", (route) => route.fulfill({
    status: user ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(user ? { access_token: "test-access-token", token_type: "bearer" } : { error: "unauthorized" }),
  }));
  await context.route("**/api/auth/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(user),
  }));
  const page = await context.newPage();
  await page.goto(new URL("/", baseURL).toString());
  return { context, page };
}

test("авторизованный пользователь видит свой аккаунт на лендинге", async ({ browser, baseURL }) => {
  const { context, page } = await openLanding(browser, baseURL);

  try {
    await expect(page.getByTitle(testUser.email)).toBeVisible();
    await expect(page.getByRole("button", { name: "Мои проекты" })).toBeVisible();
    await expect(page.getByText("Войти", { exact: true })).toBeHidden();
  } finally {
    await context.close();
  }
});

test("анонимный пользователь видит приглашение войти", async ({ browser, baseURL }) => {
  const { context, page } = await openLanding(browser, baseURL, null);

  try {
    await expect(page.getByText("Войти", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Начать бесплатно" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Мои проекты" })).toBeHidden();
  } finally {
    await context.close();
  }
});

test("лендинг рассказывает про моделирование через MCP и ведёт к ключу", async ({ browser, baseURL }) => {
  const { context, page } = await openLanding(browser, baseURL);

  try {
    await page.getByRole("link", { name: "ИИ и MCP" }).click();
    const section = page.locator("#ai");
    await expect(section.getByRole("heading", { name: "Опишите деталь словами" })).toBeInViewport();
    await expect(page.getByTestId("landing-mcp-command")).toContainText(new URL("/mcp", baseURL).toString());
    await expect(section.getByRole("link", { name: "Инструкция по подключению" })).toHaveAttribute("href", /github\.com\/krometra\/krometra\/.*mcp\/README\.md/);
    await section.getByRole("button", { name: "Подключить ассистента" }).click();
    await expect(page).toHaveURL(/\/account$/);
  } finally {
    await context.close();
  }
});
