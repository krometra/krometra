<script setup lang="ts">
import { useRouter } from "vue-router";
import KrLogo from "@/components/ui/KrLogo.vue";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher.vue";

defineProps<{
  title: string;
  subtitle: string;
}>();

const router = useRouter();
</script>

<template>
  <div :class="$style.page">
    <div :class="$style.shell">
      <div :class="$style.header">
        <KrLogo :class="$style.logo" @click="router.push('/')" />
        <LocaleSwitcher />
      </div>

      <div :class="$style.card">
        <h2 :class="$style.title">{{ title }}</h2>
        <p :class="$style.subtitle">{{ subtitle }}</p>
        <slot />
      </div>
    </div>
  </div>
</template>

<style module>
.page {
  height: 100vh;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 24px 16px;
  background-color: var(--kr-surface);
  background-image:
    radial-gradient(60% 50% at 50% 40%, oklch(0.92 0.04 244 / 0.75), transparent),
    linear-gradient(oklch(0.78 0.012 250 / 0.45) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.78 0.012 250 / 0.45) 1px, transparent 1px);
  background-size: 100% 100%, 34px 34px, 34px 34px;
}

.shell {
  width: 400px;
  max-width: 100%;
  margin: auto 0;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 34px;
}

.logo {
  cursor: pointer;
}

.card {
  border: 1px solid var(--kr-border);
  border-radius: 14px;
  background: var(--kr-surface-raised);
  padding: 34px;
  box-shadow: var(--kr-shadow-md);
}

.title {
  font-size: 23px;
  font-weight: var(--kr-font-weight-bold);
  margin: 0 0 7px;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 14px;
  color: var(--kr-text-secondary);
  margin: 0 0 28px;
}
</style>
