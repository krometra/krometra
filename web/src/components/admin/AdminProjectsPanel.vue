<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { KTable } from "@krometra/ui-kit";
import { useAdminProjects } from "@/composables/admin/useAdminProjects";
import { formatCount, formatDate, formatRelative, formatStorage } from "@/lib/admin/format";
import { operationLabel } from "@/lib/admin/operationLabels";
import type { AdminKindCount } from "@/types/api";
import AdminTableToolbar from "./AdminTableToolbar.vue";

const { t, locale } = useI18n();
const projects = useAdminProjects();

const paginationTranslations = computed(() => ({
  rootLabel: t("admin.pagination"),
  prevTriggerLabel: t("admin.previous"),
  nextTriggerLabel: t("admin.next"),
  itemLabel: ({ page, totalPages }: { page: number; totalPages: number }) => t("admin.pageOf", { page, totalPages }),
  rangeLabel: ({ from, to, total }: { from: number; to: number; total: number }) => t("admin.range", { from, to, total }),
}));

const columns = computed(() => [
  { key: "name", label: t("admin.project"), sortable: true },
  { key: "owner_email", label: t("admin.owner"), sortable: true },
  { key: "created_at", label: t("admin.created"), sortable: true, nowrap: true },
  { key: "updated_at", label: t("admin.updated"), sortable: true, nowrap: true },
  { key: "operations", label: t("admin.operations"), sortable: true, align: "right" },
  { key: "bodies", label: t("admin.bodies"), sortable: true, align: "right" },
  { key: "sketches", label: t("admin.sketches"), sortable: true, align: "right" },
  { key: "top_operations", label: t("admin.topOperations") },
  { key: "storage_bytes", label: t("admin.storage"), sortable: true, align: "right", nowrap: true },
  { key: "document_version", label: t("admin.version"), sortable: true, align: "right" },
]);

function topOperations(kinds: AdminKindCount[]) {
  return kinds.length ? kinds.map((k) => `${operationLabel(k.kind, t)} ${k.count}`).join(", ") : "—";
}

onMounted(projects.load);
</script>

<template>
  <div :class="$style.root" data-testid="admin-projects">
    <AdminTableToolbar
      :search="projects.search.value"
      :placeholder="t('admin.projectSearch')"
      :total="projects.total.value"
      :failure="projects.failure.value"
      :failure-text="t('admin.projectsFailed')"
      data-testid="admin-projects-search"
      @search="projects.setSearch"
    />
    <KTable
      :columns="columns"
      :loading-text="t('admin.tableLoading')"
      :pagination-translations="paginationTranslations"
      :rows="projects.rows.value"
      :loading="projects.loading.value && !projects.rows.value.length"
      :sort-key="projects.state.value.sort"
      :sort-dir="projects.state.value.order"
      :page="projects.state.value.page"
      :page-size="projects.state.value.pageSize"
      :total="projects.total.value"
      :empty-text="t('admin.projectsEmpty')"
      dense
      @update:sort-key="projects.setSortKey"
      @update:sort-dir="projects.setSortOrder"
      @update:page="projects.setPage"
    >
      <template #cell-name="{ row }"><span :class="$style.name">{{ row.name }}</span></template>
      <template #cell-created_at="{ row }">{{ formatDate(row.created_at, locale) }}</template>
      <template #cell-updated_at="{ row }">{{ formatRelative(row.updated_at, new Date(), locale, t) }}</template>
      <template #cell-operations="{ row }">{{ formatCount(row.operations, locale) }}</template>
      <template #cell-top_operations="{ row }"><span :class="$style.sub">{{ topOperations(row.top_operations) }}</span></template>
      <template #cell-storage_bytes="{ row }">{{ formatStorage(row.storage_bytes, locale) }}</template>
      <template #cell-document_version="{ row }">{{ row.document_version ?? "—" }}</template>
    </KTable>
  </div>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
}

.name {
  font-weight: var(--kr-font-weight-medium);
}

.sub {
  color: var(--kr-text-muted);
  font-size: var(--kr-font-size-xs);
}
</style>
