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
} from "@/lib/mcpConnect";
import CopyField from "./CopyField.vue";

const props = defineProps<{ origin: string }>();

const { t } = useI18n();
const genericConnect = computed(() => connectCommand(props.origin, API_KEY_PLACEHOLDER));
</script>

<template>
  <section :class="$style.guide" data-testid="mcp-guide">
    <h2 :class="$style.title">{{ t("account.guide.title") }}</h2>
    <ol :class="$style.steps">
      <li :class="$style.step">
        <div :class="$style.stepTitle">{{ t("account.guide.install.title") }}</div>
        <p :class="$style.text">{{ t("account.guide.install.text") }}</p>
        <CopyField :value="INSTALL_COMMAND" />
      </li>
      <li :class="$style.step">
        <div :class="$style.stepTitle">{{ t("account.guide.connect.title") }}</div>
        <p :class="$style.text">{{ t("account.guide.connect.text") }}</p>
        <CopyField :value="genericConnect" />
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

.title {
  margin: 0;
  font-size: var(--cs-font-size-lg);
  font-weight: var(--cs-font-weight-bold);
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
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text-secondary);
}

.stepTitle {
  font-weight: var(--cs-font-weight-medium);
}

.text {
  margin: 0;
  color: var(--cs-text-secondary);
  font-size: var(--cs-font-size-sm);
  line-height: 1.55;
}

.more {
  align-self: flex-start;
  font-size: var(--cs-font-size-sm);
  color: var(--cs-primary);
}
</style>
