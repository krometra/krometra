import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const adminPassword = process.env.E2E_USER_PASSWORD || "testpass123";
const regular = { email: "e2e-regular@example.com", password: "testpass123" };

async function login(api: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await api.post("/api/auth/token", { form: { grant_type: "password", username: email, password } });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

async function accessToken(api: APIRequestContext): Promise<string> {
  return login(api, adminEmail, adminPassword);
}

async function loginRegular(api: APIRequestContext): Promise<string> {
  const register = await api.post("/api/auth/register", { data: { ...regular, display_name: "Обычный E2E", personal_data_consent: true } });
  expect([201, 409]).toContain(register.status());
  return login(api, regular.email, regular.password);
}

async function findUser(api: APIRequestContext, token: string, email: string) {
  const response = await api.get(`/api/admin/users?q=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status(), `${adminEmail} должен быть админом: python -m app.cli admin grant ${adminEmail}`).toBe(200);
  const page = (await response.json()) as { items: { id: string; email: string; is_admin: boolean }[] };
  return page.items.find((item) => item.email === email);
}

async function setRole(api: APIRequestContext, token: string, userId: string, isAdmin: boolean) {
  const response = await api.patch(`/api/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { is_admin: isAdmin },
  });
  expect(response.ok()).toBeTruthy();
}

async function searchIn(page: Page, testId: string, query: string) {
  await page.getByTestId(testId).locator("input").fill(query);
}

test.describe.configure({ mode: "serial" });

test("обычный пользователь не попадает в /admin и получает 403 от API", async ({ browser, baseURL, page }) => {
  const adminToken = await accessToken(page.request);
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const token = await loginRegular(context.request);
    const existing = await findUser(page.request, adminToken, regular.email);
    if (existing?.is_admin) await setRole(page.request, adminToken, existing.id, false);

    for (const url of ["/api/admin/overview?days=7", "/api/admin/users", "/api/admin/projects"]) {
      const response = await context.request.get(url, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status()).toBe(403);
      expect((await response.json()).detail.error).toBe("forbidden");
    }
    expect((await context.request.get("/api/admin/overview")).status()).toBe(401);

    const regularPage = await context.newPage();
    await regularPage.goto("/admin");
    await expect(regularPage).toHaveURL(/\/projects$/);
    await expect(regularPage.getByText("Мои проекты")).toBeVisible();
    await expect(regularPage.getByTestId("admin-link")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("админ видит аналитику, ищет пользователей и проекты, меняет роль", async ({ page }) => {
  const token = await accessToken(page.request);
  const projectName = `Админ-проект ${Date.now()}`;
  const created = await page.request.post("/api/projects/", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: projectName },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/projects");
  await page.getByTestId("admin-link").click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Администрирование" })).toBeVisible();

  await expect(page.getByTestId("admin-kpi-users")).toContainText(/\d/);
  await expect(page.getByTestId("admin-kpi-projects")).toContainText(/\d/);
  await expect(page.getByTestId("admin-kpi-storage")).toContainText(/Б|КБ|МБ|ГБ/);
  await expect(page.getByTestId("admin-activity-chart").locator("svg path").first()).toBeVisible();
  await expect(page.getByTestId("admin-operations")).toBeVisible();

  const week = page.waitForResponse((response) => response.url().includes("/api/admin/overview?days=7") && response.ok());
  await page.getByTestId("admin-period").getByText("7 дней").click();
  await week;
  await expect(page.getByTestId("admin-kpi-users")).toContainText("за 7 дн.");

  const users = page.getByTestId("admin-users");
  await searchIn(page, "admin-users-search", adminEmail);
  await expect(users.getByText(adminEmail)).toBeVisible();
  await expect(users.getByText(regular.email)).toHaveCount(0);
  await expect(page.getByTestId(`admin-role-${adminEmail}`).locator("input")).toBeDisabled();

  await searchIn(page, "admin-users-search", regular.email);
  const roleSwitch = page.getByTestId(`admin-role-${regular.email}`);
  await expect(roleSwitch.locator("input")).not.toBeChecked();
  await roleSwitch.click();
  await expect(page.getByText("Назначить администратором?")).toBeVisible();
  await page.getByTestId("admin-role-confirm").click();
  await expect(roleSwitch.locator("input")).toBeChecked();
  expect((await findUser(page.request, token, regular.email))?.is_admin).toBe(true);

  await roleSwitch.click();
  await expect(page.getByText("Снять роль администратора?")).toBeVisible();
  await page.getByTestId("admin-role-confirm").click();
  await expect(roleSwitch.locator("input")).not.toBeChecked();
  expect((await findUser(page.request, token, regular.email))?.is_admin).toBe(false);

  await page.getByRole("tab", { name: "Проекты" }).click();
  const projects = page.getByTestId("admin-projects");
  await searchIn(page, "admin-projects-search", projectName);
  await expect(projects.locator("tbody tr")).toHaveCount(1);
  await expect(projects.locator("tbody tr")).toContainText([projectName]);
  await expect(projects.locator("tbody tr")).toContainText([adminEmail]);
});
