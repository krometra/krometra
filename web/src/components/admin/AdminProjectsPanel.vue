<script setup lang="ts">
import { onMounted } from "vue";
import { FxTable } from "foxy-ui-kit";
import { useAdminProjects } from "@/composables/admin/useAdminProjects";
import { formatCount, formatDate, formatRelative, formatStorage } from "@/lib/admin/format";
import { operationLabel } from "@/lib/admin/operationLabels";
import type { AdminKindCount } from "@/types/api";
import AdminTableToolbar from "./AdminTableToolbar.vue";

const projects = useAdminProjects();

const columns = [
  { key: "name", label: "Проект", sortable: true },
  { key: "owner_email", label: "Владелец", sortable: true },
  { key: "created_at", label: "Создан", sortable: true, nowrap: true },
  { key: "updated_at", label: "Изменён", sortable: true, nowrap: true },
  { key: "operations", label: "Операции", sortable: true, align: "right" },
  { key: "bodies", label: "Тела", sortable: true, align: "right" },
  { key: "sketches", label: "Эскизы", sortable: true, align: "right" },
  { key: "top_operations", label: "Чаще всего" },
  { key: "storage_bytes", label: "Хранилище", sortable: true, align: "right", nowrap: true },
  { key: "document_version", label: "Версия", sortable: true, align: "right" },
];

function topOperations(kinds: AdminKindCount[]) {
  return kinds.length ? kinds.map((k) => `${operationLabel(k.kind)} ${k.count}`).join(", ") : "—";
}

onMounted(projects.load);
</script>

<template>
  <div :class="$style.root" data-testid="admin-projects">
    <AdminTableToolbar
      :search="projects.search.value"
      placeholder="Поиск по названию или почте владельца"
      :total="projects.total.value"
      :failure="projects.failure.value"
      failure-text="Не удалось загрузить проекты."
      data-testid="admin-projects-search"
      @search="projects.setSearch"
    />
    <FxTable
      :columns="columns"
      :rows="projects.rows.value"
      :loading="projects.loading.value && !projects.rows.value.length"
      :sort-key="projects.state.value.sort"
      :sort-dir="projects.state.value.order"
      :page="projects.state.value.page"
      :page-size="projects.state.value.pageSize"
      :total="projects.total.value"
      empty-text="Проекты не найдены"
      dense
      @update:sort-key="projects.setSortKey"
      @update:sort-dir="projects.setSortOrder"
      @update:page="projects.setPage"
    >
      <template #cell-name="{ row }"><span :class="$style.name">{{ row.name }}</span></template>
      <template #cell-created_at="{ row }">{{ formatDate(row.created_at) }}</template>
      <template #cell-updated_at="{ row }">{{ formatRelative(row.updated_at) }}</template>
      <template #cell-operations="{ row }">{{ formatCount(row.operations) }}</template>
      <template #cell-top_operations="{ row }"><span :class="$style.sub">{{ topOperations(row.top_operations) }}</span></template>
      <template #cell-storage_bytes="{ row }">{{ formatStorage(row.storage_bytes) }}</template>
      <template #cell-document_version="{ row }">{{ row.document_version ?? "—" }}</template>
    </FxTable>
  </div>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-md);
}

.name {
  font-weight: var(--cs-font-weight-medium);
}

.sub {
  color: var(--cs-text-muted);
  font-size: var(--cs-font-size-xs);
}
</style>
