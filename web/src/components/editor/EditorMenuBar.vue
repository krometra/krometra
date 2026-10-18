<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import KrLogo from "@/components/ui/KrLogo.vue";
import KrButton from "@/components/ui/KrButton.vue";
import ExportMenu from "@/components/editor/ExportMenu.vue";
import ImportStepButton from "@/components/editor/ImportStepButton.vue";
import type { DocStatus } from "@/composables/editor/useDocumentStatus";
import type { MeshFormat } from "@/composables/editor/exportSource";

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
  "export-step": [];
  "export-mesh": [format: MeshFormat];
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
    <KrLogo :size="22" :show-text="false" :class="$style.homeBtn" @click="router.push('/projects')" />
    <div :class="$style.breadcrumb">
      <span :class="$style.crumbLink" @click="router.push('/projects')">Мои проекты</span>
      <span :class="$style.crumbSep">/</span>
      <span :class="$style.crumbActive">{{ projectName }}</span>
      <span :class="[$style.versionTag, $style[docStatus]]">v{{ docVersion }} · {{ statusLabel }}</span>
      <KrButton v-if="docStatus === 'conflict'" variant="ghost" size="sm" :class="$style.reloadBtn" @click="emit('reload')">Обновить</KrButton>
    </div>
    <div :class="$style.menuRight">
      <ImportStepButton :loading="importLoading" @import="emit('import-step')" />
      <ExportMenu
        :loading="exportLoading"
        :error="exportError"
        @export-step="emit('export-step')"
        @export-mesh="(format) => emit('export-mesh', format)"
      />
      <div :class="$style.avatar" :title="auth.user.value?.display_name ?? ''">{{ avatarInitial }}</div>
    </div>
  </header>
</template>

<style module>
.menuBar {
  height: 46px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--kr-border-subtle);
  background: var(--kr-surface-alt);
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
  color: var(--kr-text-secondary);
}

.crumbLink {
  cursor: pointer;
}

.crumbLink:hover {
  color: var(--kr-text);
}

.crumbSep {
  color: var(--kr-text-muted);
}

.crumbActive {
  color: var(--kr-text);
  font-weight: var(--kr-font-weight-medium);
}

.versionTag {
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
  border: 1px solid var(--kr-border-strong);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 4px;
}

.versionTag.saved {
  color: var(--kr-green-strong);
  border-color: var(--kr-green-border);
}

.versionTag.saving,
.versionTag.unsaved {
  color: var(--kr-amber-strong);
  border-color: var(--kr-amber-border);
}

.versionTag.conflict {
  color: var(--kr-red-strong);
  border-color: var(--kr-error);
}

.reloadBtn.reloadBtn {
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-red-strong);
  background: transparent;
  border: 1px solid var(--kr-error);
  border-radius: 4px;
  padding: 1px 8px;
}

.reloadBtn.reloadBtn:hover {
  color: var(--kr-red-strong);
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
  background: var(--kr-red);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--kr-font-weight-bold);
  font-size: 13px;
  color: #fff;
}
</style>
