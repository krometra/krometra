import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

const MAILPIT = process.env.E2E_MAILPIT_URL || "http://localhost:8025";
const PASSWORD = "first-pass-123";
const NEW_PASSWORD = "second-pass-456";

const SUBJECT = {
  verify: "Подтвердите почту в Крометре",
  reset: "Восстановление пароля в Крометре",
  changed: "Пароль в Крометре изменён",
};

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function waitForMail(api: APIRequestContext, to: string, subject: string): Promise<string> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const response = await api.get(`${MAILPIT}/api/v1/messages?limit=200`);
        if (!response.ok()) return false;
        const { messages } = (await response.json()) as { messages: MailpitSummary[] };
        found = messages.find(
          (message) => message.Subject === subject && message.To.some((recipient) => recipient.Address === to),
        );
        return Boolean(found);
      },
      { timeout: 20_000, message: `письмо «${subject}» для ${to} в Mailpit ${MAILPIT}` },
    )
    .toBe(true);
  const message = await api.get(`${MAILPIT}/api/v1/message/${found!.ID}`);
  return ((await message.json()) as { Text: string }).Text;
}

function linkPath(text: string, path: string): string {
  const match = text.match(new RegExp(`https?://\\S+?(${path}\\?token=[\\w-]+)`));
  expect(match, `в письме нет ссылки ${path}`).not.toBeNull();
  return match![1];
}

async function freshContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

async function registerByApi(api: APIRequestContext, email: string): Promise<void> {
  const response = await api.post("/api/auth/register", { data: { email, password: PASSWORD } });
  expect(response.status()).toBe(201);
}

async function passwordWorks(api: APIRequestContext, email: string, password: string): Promise<boolean> {
  const response = await api.post("/api/auth/token", { form: { grant_type: "password", username: email, password } });
  return response.ok();
}

async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Продолжить" }).click();
}

async function loginByUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await fillLogin(page, email, password);
  await expect(page).toHaveURL(/\/projects$/);
}

test("регистрация отправляет письмо, ссылка из него подтверждает почту", async ({ browser, baseURL, request }) => {
  const email = uniqueEmail("verify");
  const context = await freshContext(browser, baseURL);
  try {
    const page = await context.newPage();
    await page.goto("/register");
    await page.getByLabel("Почта").fill(email);
    await page.getByLabel("Пароль").fill(PASSWORD);
    await page.getByRole("button", { name: "Создать аккаунт" }).click();

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId("email-verify-banner")).toContainText(email);

    const text = await waitForMail(request, email, SUBJECT.verify);
    await page.goto(linkPath(text, "/verify-email"));
    await expect(page.getByTestId("verify-email-success")).toBeVisible();

    await page.goto("/projects");
    await expect(page.getByText("Мои проекты").first()).toBeVisible();
    await expect(page.getByTestId("email-verify-banner")).toHaveCount(0);

    await page.goto("/account");
    await expect(page.getByTestId("email-verified")).toContainText(email);
    await expect(page.getByTestId("api-key-create")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("без подтверждения почты ключ MCP создать нельзя", async ({ browser, baseURL }) => {
  const email = uniqueEmail("nokey");
  const context = await freshContext(browser, baseURL);
  try {
    await registerByApi(context.request, email);
    const page = await context.newPage();
    await loginByUi(page, email, PASSWORD);
    await page.goto("/account");
    await expect(page.getByTestId("email-unverified")).toContainText(email);
    await expect(page.getByTestId("api-key-needs-email")).toBeVisible();
    await expect(page.getByTestId("api-key-create")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("восстановление пароля по ссылке: новый пароль пускает, старый нет", async ({ browser, baseURL, request }) => {
  const email = uniqueEmail("reset");
  const context = await freshContext(browser, baseURL);
  try {
    await registerByApi(context.request, email);
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByTestId("forgot-password-link").click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("Почта").fill(email);
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByTestId("forgot-sent")).toContainText(email);

    const text = await waitForMail(request, email, SUBJECT.reset);
    await page.goto(linkPath(text, "/reset-password"));
    await page.getByLabel("Новый пароль").fill(NEW_PASSWORD);
    await page.getByLabel("Повторите пароль").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Сохранить пароль" }).click();

    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByTestId("password-reset-notice")).toBeVisible();
    await fillLogin(page, email, PASSWORD);
    await expect(page.getByText("Неверная почта или пароль")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await fillLogin(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId("email-verify-banner")).toHaveCount(0);
    expect(await passwordWorks(request, email, PASSWORD)).toBe(false);

    await waitForMail(request, email, SUBJECT.changed);
  } finally {
    await context.close();
  }
});

test("смена пароля в аккаунте", async ({ browser, baseURL, request }) => {
  const email = uniqueEmail("change");
  const context = await freshContext(browser, baseURL);
  try {
    await registerByApi(context.request, email);
    const page = await context.newPage();
    await loginByUi(page, email, PASSWORD);
    await page.goto("/account");

    const form = page.getByTestId("password-change");
    await form.getByLabel("Текущий пароль").fill("wrong-pass-000");
    await form.getByLabel("Новый пароль").fill(NEW_PASSWORD);
    await form.getByLabel("Повторите пароль").fill(NEW_PASSWORD);
    await form.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(form.getByRole("alert")).toContainText("Текущий пароль неверен");

    await form.getByLabel("Текущий пароль").fill(PASSWORD);
    await form.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByText("Пароль изменён").first()).toBeVisible();
    await expect(form.getByLabel("Текущий пароль")).toHaveValue("");

    await waitForMail(request, email, SUBJECT.changed);
    expect(await passwordWorks(request, email, PASSWORD)).toBe(false);
    expect(await passwordWorks(request, email, NEW_PASSWORD)).toBe(true);

    await page.reload();
    await expect(page).toHaveURL(/\/account$/);
  } finally {
    await context.close();
  }
});
