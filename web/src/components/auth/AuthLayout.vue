<script setup lang="ts">
import { useRouter } from "vue-router";
import CsLogo from "@/components/ui/CsLogo.vue";
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
        <CsLogo :class="$style.logo" @click="router.push('/landing')" />
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
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--cs-surface);
  background-image:
    radial-gradient(60% 50% at 50% 40%, oklch(0.92 0.04 244 / 0.75), transparent),
    linear-gradient(oklch(0.78 0.012 250 / 0.45) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.78 0.012 250 / 0.45) 1px, transparent 1px);
  background-size: 100% 100%, 34px 34px, 34px 34px;
}

.shell {
  width: 400px;
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
  border: 1px solid var(--cs-border);
  border-radius: 14px;
  background: var(--cs-surface-raised);
  padding: 34px;
  box-shadow: var(--cs-shadow-md);
}

.title {
  font-size: 23px;
  font-weight: var(--cs-font-weight-bold);
  margin: 0 0 7px;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 14px;
  color: var(--cs-text-secondary);
  margin: 0 0 28px;
}
</style>
