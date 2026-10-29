<script setup lang="ts">
import { useRouter } from "vue-router";
import KrLogo from "@/components/ui/KrLogo.vue";
import { LEGAL_EDITION } from "@/lib/legal";

defineProps<{
  title: string;
}>();

const router = useRouter();
</script>

<template>
  <div :class="$style.page" lang="ru">
    <header :class="$style.header">
      <KrLogo :class="$style.logo" @click="router.push('/')" />
    </header>

    <article :class="$style.doc">
      <h1 :class="$style.title">{{ title }}</h1>
      <p :class="$style.edition">Редакция от {{ LEGAL_EDITION }}</p>
      <slot />
    </article>

    <footer :class="$style.footer">
      <router-link to="/privacy">Политика обработки персональных данных</router-link>
      <router-link to="/consent">Согласие на обработку персональных данных</router-link>
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
