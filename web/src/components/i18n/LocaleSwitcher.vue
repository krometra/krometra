<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
import { toast } from "@/composables/useToast";
import { LOCALES, LOCALE_HTML_LANG, LOCALE_NAMES, type Locale } from "@/lib/i18n/locale";
import KrButton from "@/components/ui/KrButton.vue";

const { locale, t, setLocale } = useI18n();

async function select(next: Locale) {
  try {
    await setLocale(next);
  } catch {
    toast(t("common.languageLoadFailed"), "error");
  }
}
</script>

<template>
  <div :class="$style.switcher" role="group" :aria-label="t('common.language')" data-testid="locale-switcher">
    <KrButton
      v-for="option in LOCALES"
      :key="option"
      :variant="option === locale ? 'secondary' : 'ghost'"
      size="sm"
      :lang="LOCALE_HTML_LANG[option]"
      :aria-pressed="option === locale"
      :data-testid="`locale-${option}`"
      @click="select(option)"
    >
      {{ LOCALE_NAMES[option] }}
    </KrButton>
  </div>
</template>

<style module>
.switcher {
  display: flex;
  gap: 2px;
}
</style>
