import { readonly, ref, shallowRef, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import {
  SOURCE_CATALOG,
  loadDictionary,
  type MessageDescriptor,
  type MessageKey,
  type MessageKeyArgs,
} from "@/lib/i18n/catalog";
import {
  LOCALE_HTML_LANG,
  SOURCE_LOCALE,
  resolveInitialLocale,
  type Locale,
} from "@/lib/i18n/locale";
import { translate, type Catalog } from "@/lib/i18n/translate";

const LOCALE_STORAGE_KEY = "cad-studio.locale";

function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    return;
  }
}

export const useI18n = createSharedComposable(() => {
  const catalog = shallowRef<Catalog>(SOURCE_CATALOG);
  const locale = ref<Locale>(SOURCE_LOCALE);
  let lastRequest = 0;

  function t<Key extends MessageKey>(key: Key, ...args: MessageKeyArgs<Key>): string {
    return translate(catalog.value, locale.value, key, args[0]);
  }

  function tMessage(message: MessageDescriptor): string {
    return translate(catalog.value, locale.value, message.key, message.values);
  }

  async function activate(next: Locale): Promise<boolean> {
    const request = ++lastRequest;
    if (!catalog.value[next]) {
      const dictionary = await loadDictionary(next);
      catalog.value = { ...catalog.value, [next]: dictionary };
    }
    if (request !== lastRequest) return false;
    locale.value = next;
    return true;
  }

  async function setLocale(next: Locale): Promise<void> {
    if (await activate(next)) storeLocale(next);
  }

  async function initialize(): Promise<void> {
    const initial = resolveInitialLocale({
      stored: readStoredLocale(),
      envDefault: import.meta.env.VITE_DEFAULT_LOCALE,
    });
    await activate(initial).catch(() => false);
  }

  function syncDocument() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = LOCALE_HTML_LANG[locale.value];
    document.title = t("common.documentTitle", { product: t("common.productName") });
  }

  watch(locale, syncDocument, { immediate: true });

  return { locale: readonly(locale), t, tMessage, setLocale, initialize };
});
