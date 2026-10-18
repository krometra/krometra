<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import {
  API_KEY_PLACEHOLDER,
  INSTALL_COMMAND,
  MCP_README_URL,
  MCP_SERVER_NAME,
  REMOVE_COMMAND,
  VERIFY_COMMAND,
  connectCommand,
  localConnectCommand,
} from "@/lib/mcpConnect";
import AgentPromptCopy from "./AgentPromptCopy.vue";
import CopyField from "./CopyField.vue";

const props = defineProps<{ origin: string }>();

const { t } = useI18n();
const genericConnect = computed(() => connectCommand(props.origin, API_KEY_PLACEHOLDER));
const localConnect = computed(() => localConnectCommand(props.origin, API_KEY_PLACEHOLDER));
</script>

<template>
  <section :class="$style.guide" data-testid="mcp-guide">
    <div :class="$style.header">
      <h2 :class="$style.title">{{ t("account.guide.title") }}</h2>
      <AgentPromptCopy :origin="origin" />
    </div>
    <ol :class="$style.steps">
      <li :class="$style.step">
        <div :class="$style.stepTitle">{{ t("account.guide.connect.title") }}</div>
        <p :class="$style.text">{{ t("account.guide.connect.text") }}</p>
        <CopyField :value="genericConnect" />
      </li>
      <li :class="$style.step">
        <div :class="$style.stepTitle">{{ t("account.guide.open.title") }}</div>
        <p :class="$style.text">{{ t("account.guide.open.text") }}</p>
      </li>
      <li :class="$style.step">
        <div :class="$style.stepTitle">{{ t("account.guide.verify.title") }}</div>
        <p :class="$style.text">{{ t("account.guide.verify.text", { server: MCP_SERVER_NAME }) }}</p>
        <CopyField :value="VERIFY_COMMAND" />
      </li>
      <li :class="$style.step">
        <div :class="$style.stepTitle">{{ t("account.guide.revoke.title") }}</div>
        <p :class="$style.text">{{ t("account.guide.revoke.text") }}</p>
        <CopyField :value="REMOVE_COMMAND" />
      </li>
    </ol>
    <details :class="$style.local">
      <summary :class="$style.stepTitle">{{ t("account.guide.local.title") }}</summary>
      <p :class="$style.text">{{ t("account.guide.local.text") }}</p>
      <CopyField :value="INSTALL_COMMAND" />
      <p :class="$style.text">{{ t("account.guide.local.connect") }}</p>
      <CopyField :value="localConnect" />
    </details>
    <a :class="$style.more" :href="MCP_README_URL" target="_blank" rel="noopener noreferrer">
      {{ t("account.guide.more") }}
    </a>
  </section>
</template>

<style module>
.guide {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: var(--kr-font-size-lg);
  font-weight: var(--kr-font-weight-bold);
}

.steps {
  margin: 0;
  padding-left: 22px;
  list-style: decimal;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.step > * + * {
  margin-top: 8px;
}

.step::marker {
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text-secondary);
}

.stepTitle {
  font-weight: var(--kr-font-weight-medium);
}

.text {
  margin: 0;
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
  line-height: 1.55;
}

.local {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.local > * + * {
  margin-top: 8px;
}

.local summary {
  cursor: pointer;
}

.more {
  align-self: flex-start;
  font-size: var(--kr-font-size-sm);
  color: var(--kr-primary);
}
</style>
