<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import CsLogo from "@/components/ui/CsLogo.vue";
import CsButton from "@/components/ui/CsButton.vue";
import ExportMenu from "@/components/editor/ExportMenu.vue";
import ImportStepButton from "@/components/editor/ImportStepButton.vue";
import type { DocStatus } from "@/composables/editor/useDocumentStatus";

defineProps<{
  projectName: string;
  docStatus: DocStatus;
  statusLabel: string;
  docVersion: number;
  exportLoading: boolean;
  exportError: string | null;
  importLoading: boolean;
}>();

const emit = defineEmits<{
  reload: [];
  "export-stl": [];
  "export-step": [];
  "import-step": [];
}>();

const router = useRouter();
const auth = useAuth();

const avatarInitial = computed(() => {
  const source = auth.user.value?.display_name?.trim() || auth.user.value?.email || "?";
  return source[0].toUpperCase();
});
</script>

<template>
  <header :class="$style.menuBar">
    <CsLogo :size="22" :show-text="false" :class="$style.homeBtn" @click="router.push('/')" />
    <div :class="$style.breadcrumb">
      <span :class="$style.crumbLink" @click="router.push('/')">Мои проекты</span>
      <span :class="$style.crumbSep">/</span>
      <span :class="$style.crumbActive">{{ projectName }}</span>
      <span :class="[$style.versionTag, $style[docStatus]]">v{{ docVersion }} · {{ statusLabel }}</span>
      <CsButton v-if="docStatus === 'conflict'" variant="ghost" size="sm" :class="$style.reloadBtn" @click="emit('reload')">Обновить</CsButton>
    </div>
    <div :class="$style.menuRight">
      <ImportStepButton :loading="importLoading" @import="emit('import-step')" />
      <ExportMenu
        :loading="exportLoading"
        :error="exportError"
        @export-stl="emit('export-stl')"
        @export-step="emit('export-step')"
      />
      <div :class="$style.avatar" :title="auth.user.value?.display_name ?? ''">{{ avatarInitial }}</div>
    </div>
  </header>
</template>

<style module>
.menuBar {
  height: 46px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--cs-border-subtle);
  background: var(--cs-surface-alt);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 14px;
}

.homeBtn {
  cursor: pointer;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--cs-text-secondary);
}

.crumbLink {
  cursor: pointer;
}

.crumbLink:hover {
  color: var(--cs-text);
}

.crumbSep {
  color: var(--cs-text-disabled);
}

.crumbActive {
  color: var(--cs-text);
  font-weight: var(--cs-font-weight-medium);
}

.versionTag {
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-muted);
  border: 1px solid var(--cs-border-strong);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 4px;
}

.versionTag.saved {
  color: var(--cs-green);
  border-color: var(--cs-green-border);
}

.versionTag.saving,
.versionTag.unsaved {
  color: var(--cs-amber);
  border-color: var(--cs-amber-border);
}

.versionTag.conflict {
  color: var(--cs-error);
  border-color: var(--cs-error);
}

.reloadBtn.reloadBtn {
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-error);
  background: transparent;
  border: 1px solid var(--cs-error);
  border-radius: 4px;
  padding: 1px 8px;
}

.reloadBtn.reloadBtn:hover {
  color: var(--cs-error);
  background: transparent;
}

.menuRight {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--cs-red);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--cs-font-weight-bold);
  font-size: 13px;
  color: #fff;
}
</style>
