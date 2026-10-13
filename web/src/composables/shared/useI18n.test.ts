import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dictionary } from "@/lib/i18n/message";
import type { Locale } from "@/lib/i18n/locale";

const STORAGE_KEY = "cad-studio.locale";

function createStorage(stored?: string) {
  const data = new Map<string, string>(stored ? [[STORAGE_KEY, stored]] : []);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

async function setup(options: { stored?: string; envDefault?: string; storage?: object } = {}) {
  vi.resetModules();
  const html = { lang: "" };
  const page = { documentElement: html, title: "" };
  const storage = options.storage ?? createStorage(options.stored);
  vi.stubGlobal("document", page);
  vi.stubGlobal("localStorage", storage);
  vi.stubEnv("VITE_DEFAULT_LOCALE", options.envDefault ?? "");
  const { useI18n } = await import("./useI18n");
  return { i18n: useI18n(), html, page, storage: storage as ReturnType<typeof createStorage> };
}

function mockDictionaryLoader(load: (locale: Locale) => Promise<Dictionary>) {
  vi.doMock("@/lib/i18n/catalog", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/i18n/catalog")>()),
    loadDictionary: load,
  }));
}

afterEach(() => {
  vi.doUnmock("@/lib/i18n/catalog");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useI18n", () => {
  it("до инициализации работает на русском", async () => {
    const { i18n, html } = await setup();

    expect(i18n.locale.value).toBe("ru");
    expect(i18n.t("auth.login.submit")).toBe("Продолжить");
    expect(html.lang).toBe("ru");
  });

  it("стартует с сохранённого выбора пользователя", async () => {
    const { i18n, html } = await setup({ stored: "zh", envDefault: "en" });

    await i18n.initialize();
    await nextTick();

    expect(i18n.locale.value).toBe("zh");
    expect(i18n.t("auth.login.submit")).toBe("继续");
    expect(html.lang).toBe("zh-Hans");
  });

  it("без сохранённого выбора берёт язык из VITE_DEFAULT_LOCALE", async () => {
    const { i18n, html } = await setup({ envDefault: "en" });

    await i18n.initialize();
    await nextTick();

    expect(i18n.locale.value).toBe("en");
    expect(i18n.t("auth.login.submit")).toBe("Continue");
    expect(html.lang).toBe("en");
  });

  it("неизвестное значение VITE_DEFAULT_LOCALE оставляет русский", async () => {
    const { i18n } = await setup({ envDefault: "klingon" });

    await i18n.initialize();

    expect(i18n.locale.value).toBe("ru");
    expect(i18n.t("auth.login.submit")).toBe("Продолжить");
  });

  it("смена языка переводит интерфейс, сохраняет выбор и обновляет lang", async () => {
    const { i18n, html, storage } = await setup();

    await i18n.setLocale("en");
    await nextTick();

    expect(i18n.locale.value).toBe("en");
    expect(i18n.t("validation.password.tooShort", { count: 1 })).toBe(
      "The password must be at least 1 character long.",
    );
    expect(storage.getItem(STORAGE_KEY)).toBe("en");
    expect(html.lang).toBe("en");
  });

  it("заголовок вкладки собирается из названия продукта на текущем языке", async () => {
    const { i18n, page } = await setup();

    expect(page.title).toBe("Крометра — параметрическая 3D-САПР в браузере");

    await i18n.setLocale("en");
    await nextTick();
    expect(page.title).toBe("Krometra — parametric 3D CAD in the browser");

    await i18n.setLocale("zh");
    await nextTick();
    expect(page.title).toBe("Krometra — 浏览器中的参数化三维 CAD");
  });

  it("tMessage переводит описание сообщения на текущий язык", async () => {
    const { i18n } = await setup();
    const message = { key: "validation.password.tooShort", values: { count: 8 } } as const;

    expect(i18n.tMessage(message)).toBe("Пароль должен быть не короче 8 символов.");
    await i18n.setLocale("zh");
    expect(i18n.tMessage(message)).toBe("密码长度不能少于 8 个字符。");
  });

  it("недоступное хранилище не мешает ни старту, ни смене языка", async () => {
    const broken = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    };
    const { i18n } = await setup({ storage: broken, envDefault: "en" });

    await i18n.initialize();
    expect(i18n.locale.value).toBe("en");

    await i18n.setLocale("zh");
    expect(i18n.locale.value).toBe("zh");
  });

  it("если словарь не загрузился, старт остаётся на русском", async () => {
    mockDictionaryLoader(() => Promise.reject(new Error("chunk load failed")));
    const { i18n } = await setup({ stored: "en" });

    await i18n.initialize();

    expect(i18n.locale.value).toBe("ru");
    expect(i18n.t("auth.login.submit")).toBe("Продолжить");
  });

  it("если словарь не загрузился, смена языка отклоняется и выбор не сохраняется", async () => {
    mockDictionaryLoader(() => Promise.reject(new Error("chunk load failed")));
    const { i18n, storage } = await setup();

    await expect(i18n.setLocale("en")).rejects.toThrow("chunk load failed");

    expect(i18n.locale.value).toBe("ru");
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("при быстрых переключениях побеждает последний выбор", async () => {
    const resolvers = new Map<Locale, (dictionary: Dictionary) => void>();
    mockDictionaryLoader((locale) => new Promise((resolve) => resolvers.set(locale, resolve)));
    const { i18n, storage } = await setup();

    const toEnglish = i18n.setLocale("en");
    const toChinese = i18n.setLocale("zh");
    resolvers.get("zh")?.({ "auth.login.submit": "继续" });
    await toChinese;
    resolvers.get("en")?.({ "auth.login.submit": "Continue" });
    await toEnglish;

    expect(i18n.locale.value).toBe("zh");
    expect(i18n.t("auth.login.submit")).toBe("继续");
    expect(storage.getItem(STORAGE_KEY)).toBe("zh");
  });
});
