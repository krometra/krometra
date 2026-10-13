import { test, expect } from "@playwright/test";

test("авторизованный пользователь видит дашборд без клика по форме логина", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Мои проекты")).toBeVisible();
});
