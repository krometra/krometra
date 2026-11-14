<script setup lang="ts">
import { computed } from "vue";
import { kernelPhaseLabel } from "@/lib/browserKernel";
import { useBrowserKernelStatus } from "@/composables/editor/browserKernelStatus";
import { useI18n } from "@/composables/shared/useI18n";

defineProps<{
  lastOpMs: number | null;
  operationCount: number;
}>();

const { t, locale } = useI18n();
const kernel = useBrowserKernelStatus();
const kernelLabel = computed(() => {
  if (locale.value === "ru") return kernelPhaseLabel(kernel.phase.value, kernel.heapBytes.value);
  switch (kernel.phase.value) {
    case "loading": return t("editor.status.kernelLoading");
    case "restarting": return t("editor.status.kernelRestarting");
    case "failed": return t("editor.status.kernelFailed");
    case "ready": return kernel.heapBytes.value > 0
      ? t("editor.status.kernelReadyMemory", { size: Math.round(kernel.heapBytes.value / (1024 * 1024)) })
      : t("editor.status.kernelReady");
    default: return t("editor.status.kernelIdle");
  }
});
const kernelTitle = computed(() => kernel.failure.value ?? t("editor.status.bodies", { count: kernel.bodyCount.value }));
</script>

<template>
  <div :class="$style.statusBar">
    <span :class="$style.kernel" :title="kernelTitle" data-testid="kernel-status">
      <span :class="[$style.statusDot, $style[kernel.phase.value]]" />{{ kernelLabel }}
    </span>
    <span>OCCT/WASM</span>
    <span>{{ t("editor.status.units") }}</span>
    <span :class="$style.statusSpacer">{{ t("editor.status.recompute", { time: lastOpMs === null ? "—" : lastOpMs }) }}</span>
    <span>{{ t("editor.status.operations", { count: operationCount }) }}</span>
  </div>
</template>

<style module>
.statusBar {
  height: 26px;
  flex-shrink: 0;
  border-top: 1px solid var(--kr-border-subtle);
  background: var(--kr-surface);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 18px;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
}

.kernel {
  display: flex;
  align-items: center;
  gap: 6px;
}

.statusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--kr-text-muted);
}

.ready {
  background: var(--kr-green);
}

.loading,
.restarting {
  background: var(--kr-amber);
  animation: pulse 1s ease-in-out infinite;
}

.failed {
  background: var(--kr-error);
}

.statusSpacer {
  margin-left: auto;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
</style>
