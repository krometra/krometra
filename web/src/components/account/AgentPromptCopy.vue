<script setup lang="ts">
import { computed } from "vue";
import { useClipboard } from "@vueuse/core";
import { useI18n } from "@/composables/shared/useI18n";
import { toast } from "@/composables/useToast";
import { API_KEY_PLACEHOLDER, MCP_README_URL, VERIFY_COMMAND, connectCommand } from "@/lib/mcpConnect";
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";

const props = defineProps<{ origin: string; apiKey?: string }>();

const { t } = useI18n();
const { copy, copied } = useClipboard({ legacy: true });

const prompt = computed(() =>
  t("account.agent.prompt", {
    connect: connectCommand(props.origin, props.apiKey ?? API_KEY_PLACEHOLDER),
    keyNote: props.apiKey ? t("account.agent.keyFilled") : t("account.agent.keyPlaceholder", { origin: props.origin }),
    verify: VERIFY_COMMAND,
    readme: MCP_README_URL,
    product: t("common.productName"),
  }),
);

async function copyPrompt() {
  try {
    await copy(prompt.value);
  } catch {
    toast(t("account.copyFailed"), "error");
  }
}
</script>

<template>
  <KrButton variant="primary" size="md" data-testid="mcp-agent-prompt" @click="copyPrompt">
    <KrIcon name="copy" :size="14" />
    {{ copied ? t("account.copied") : t("account.guide.agent") }}
  </KrButton>
</template>
