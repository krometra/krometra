<script setup lang="ts">
import { useRouter } from "vue-router";
import { useI18n } from "@/composables/shared/useI18n";
import KrLogo from "@/components/ui/KrLogo.vue";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher.vue";
import { LEGAL_EDITION } from "@/lib/legal";

defineProps<{
  title: string;
}>();

const router = useRouter();
const { t } = useI18n();
</script>

<template>
  <div :class="$style.page">
    <header :class="$style.header">
      <KrLogo :class="$style.logo" @click="router.push('/')" />
      <LocaleSwitcher />
    </header>

    <article :class="$style.doc">
      <h1 :class="$style.title">{{ title }}</h1>
      <p :class="$style.edition">{{ t("legalText.edition", { date: LEGAL_EDITION }) }}</p>
      <slot />
    </article>

    <footer :class="$style.footer">
      <router-link to="/privacy">{{ t("legalText.privacyTitle") }}</router-link>
      <router-link to="/consent">{{ t("legalText.consentTitle") }}</router-link>
    </footer>
  </div>
</template>

<style module>
.page {
  height: 100vh;
  overflow-y: auto;
  background: var(--kr-surface);
  color: var(--kr-text);
  padding: 28px 16px 40px;
}

.header {
  max-width: 760px;
  margin: 0 auto 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  cursor: pointer;
}

.doc {
  max-width: 760px;
  margin: 0 auto;
  font-size: 15px;
  line-height: 1.6;
}

.title {
  font-size: 28px;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin: 0 0 6px;
}

.edition {
  color: var(--kr-text-muted);
  font-size: 13px;
  margin: 0 0 28px;
}

.doc h2 {
  font-size: 18px;
  font-weight: var(--kr-font-weight-bold);
  margin: 28px 0 10px;
}

.doc p {
  margin: 0 0 12px;
}

.doc ul {
  margin: 0 0 12px;
  padding-left: 22px;
}

.doc li {
  margin-bottom: 4px;
}

.footer {
  max-width: 760px;
  margin: 40px auto 0;
  padding-top: 20px;
  border-top: 1px solid var(--kr-border-subtle);
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 13px;
}
</style>
