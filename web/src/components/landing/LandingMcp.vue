<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import KrButton from "@/components/ui/KrButton.vue";
import { MCP_README_URL, connectCommand } from "@/lib/mcpConnect";
import { siteOrigin } from "@/lib/siteOrigin";

const { t } = useI18n();
const emit = defineEmits<{ start: [] }>();

const command = computed(() => connectCommand(siteOrigin(), "krm_..."));

const steps = computed(() => [
  { title: t("landing.mcp.step1Title"), body: t("landing.mcp.step1Body") },
  { title: t("landing.mcp.step2Title"), body: t("landing.mcp.step2Body") },
  { title: t("landing.mcp.step3Title"), body: t("landing.mcp.step3Body") },
]);
</script>

<template>
  <section id="ai" :class="$style.section">
    <div :class="$style.intro">
      <div :class="$style.tag">{{ t("landing.mcp.tag") }}</div>
      <h2 :class="$style.h2">{{ t("landing.mcp.title") }}</h2>
      <p :class="$style.lead">
        {{ t("landing.mcp.lead", { product: t("common.productName") }) }}
      </p>
      <ol :class="$style.steps">
        <li v-for="(step, i) in steps" :key="step.title" :class="$style.step">
          <span :class="$style.stepNumber">{{ i + 1 }}</span>
          <div>
            <div :class="$style.stepTitle">{{ step.title }}</div>
            <div :class="$style.stepBody">{{ step.body }}</div>
          </div>
        </li>
      </ol>
      <div :class="$style.actions">
        <KrButton :class="$style.cta" @click="emit('start')">{{ t("landing.mcp.connect") }}</KrButton>
        <a :class="$style.docsLink" :href="MCP_README_URL" target="_blank" rel="noopener">{{ t("landing.mcp.guide") }}</a>
      </div>
    </div>

    <div :class="$style.demo">
      <div :class="$style.chat">
        <div :class="[$style.message, $style.messageUser]">
          {{ t("landing.mcp.prompt") }}
        </div>
        <div :class="[$style.message, $style.messageAgent]">
          <div :class="$style.trace">
            <span>sketch.create</span><span>{{ t("landing.mcp.extrude") }}</span><span>hole Ø4.5 ×2</span><span>{{ t("landing.mcp.fillet") }}</span>
          </div>
          {{ t("landing.mcp.reply") }}
        </div>
      </div>
      <pre :class="$style.command" data-testid="landing-mcp-command">{{ command }}</pre>
    </div>
  </section>
</template>

<style module>
.section {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 40px 90px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

.tag {
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-primary);
  margin-bottom: 14px;
}

.h2 {
  font-size: 30px;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
  margin: 0 0 16px;
}

.lead {
  font-size: 16px;
  line-height: 1.6;
  color: var(--kr-text-secondary);
  margin: 0 0 26px;
  max-width: 520px;
  text-wrap: pretty;
}

.steps {
  list-style: none;
  padding: 0;
  margin: 0 0 30px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.stepNumber {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--kr-primary-border);
  color: var(--kr-primary);
  display: grid;
  place-items: center;
  font-family: var(--kr-font-mono);
  font-size: 12px;
}

.stepTitle {
  font-size: 15px;
  font-weight: var(--kr-font-weight-bold);
  margin-bottom: 3px;
}

.stepBody {
  font-size: 14px;
  line-height: 1.5;
  color: var(--kr-text-secondary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
}

.cta.cta {
  font-weight: var(--kr-font-weight-bold);
  font-size: 15px;
  padding: 13px 24px;
  border-radius: 9px;
}

.docsLink {
  font-size: 14px;
  color: var(--kr-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.docsLink:hover {
  color: var(--kr-text);
}

.demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.chat {
  border: 1px solid var(--kr-border-strong);
  border-radius: 12px;
  background: var(--kr-surface-raised);
  box-shadow: var(--kr-shadow-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  font-size: 14px;
  line-height: 1.55;
  padding: 12px 14px;
  border-radius: 10px;
  max-width: 88%;
}

.messageUser {
  align-self: flex-end;
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
}

.messageAgent {
  align-self: flex-start;
  background: var(--kr-surface-alt);
  color: var(--kr-text);
}

.trace {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.trace span {
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
  border: 1px solid var(--kr-border);
  border-radius: 6px;
  padding: 2px 7px;
  background: var(--kr-surface-raised);
}

.command {
  margin: 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: oklch(0.24 0.02 250);
  color: oklch(0.92 0.01 250);
  font-family: var(--kr-font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr;
    padding: 0 16px 64px;
    gap: 32px;
  }
}
</style>
