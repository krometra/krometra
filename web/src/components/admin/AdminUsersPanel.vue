<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { KSwitch, KTable } from "@krometra/ui-kit";
import { useAuth } from "@/composables/shared/useAuth";
import { useAdminUsers } from "@/composables/admin/useAdminUsers";
import { formatAuthMethods, formatCount, formatDate, formatRelative, formatStorage } from "@/lib/admin/format";
import type { AdminUserRow } from "@/types/api";
import KrButton from "@/components/ui/KrButton.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import AdminTableToolbar from "./AdminTableToolbar.vue";

const { t, locale } = useI18n();
const auth = useAuth();
const users = useAdminUsers();

const paginationTranslations = computed(() => ({
  rootLabel: t("admin.pagination"),
  prevTriggerLabel: t("admin.previous"),
  nextTriggerLabel: t("admin.next"),
  itemLabel: ({ page, totalPages }: { page: number; totalPages: number }) => t("admin.pageOf", { page, totalPages }),
  rangeLabel: ({ from, to, total }: { from: number; to: number; total: number }) => t("admin.range", { from, to, total }),
}));

const columns = computed(() => [
  { key: "email", label: t("admin.user"), sortable: true },
  { key: "created_at", label: t("admin.registered"), sortable: true, nowrap: true },
  { key: "projects", label: t("admin.projects"), sortable: true, align: "right" },
  { key: "operations", label: t("admin.operations"), sortable: true, align: "right" },
  { key: "storage_bytes", label: t("admin.storage"), sortable: true, align: "right", nowrap: true },
  { key: "last_activity_at", label: t("admin.lastEdit"), sortable: true, nowrap: true },
  { key: "auth_methods", label: t("admin.signIn") },
  { key: "is_admin", label: t("admin.admin"), sortable: true, actions: true },
]);

function isSelf(row: AdminUserRow) {
  return row.id === auth.user.value?.id;
}

onMounted(users.load);
</script>

<template>
  <div :class="$style.root" data-testid="admin-users">
    <AdminTableToolbar
      :search="users.search.value"
      :placeholder="t('admin.userSearch')"
      :total="users.total.value"
      :failure="users.failure.value"
      :failure-text="t('admin.usersFailed')"
      data-testid="admin-users-search"
      @search="users.setSearch"
    />
    <KTable
      :columns="columns"
      :loading-text="t('admin.tableLoading')"
      :pagination-translations="paginationTranslations"
      :rows="users.rows.value"
      :loading="users.loading.value && !users.rows.value.length"
      :sort-key="users.state.value.sort"
      :sort-dir="users.state.value.order"
      :page="users.state.value.page"
      :page-size="users.state.value.pageSize"
      :total="users.total.value"
      :empty-text="t('admin.usersEmpty')"
      dense
      @update:sort-key="users.setSortKey"
      @update:sort-dir="users.setSortOrder"
      @update:page="users.setPage"
    >
      <template #cell-email="{ row }">
        <div :class="$style.name">{{ row.display_name || row.email }}</div>
        <div v-if="row.display_name && row.display_name !== row.email" :class="$style.sub">{{ row.email }}</div>
      </template>
      <template #cell-created_at="{ row }">{{ formatDate(row.created_at, locale) }}</template>
      <template #cell-projects="{ row }">{{ formatCount(row.projects, locale) }}</template>
      <template #cell-operations="{ row }">{{ formatCount(row.operations, locale) }}</template>
      <template #cell-storage_bytes="{ row }">{{ formatStorage(row.storage_bytes, locale) }}</template>
      <template #cell-last_activity_at="{ row }">{{ formatRelative(row.last_activity_at, new Date(), locale, t) }}</template>
      <template #cell-auth_methods="{ row }">{{ formatAuthMethods(row.auth_methods, t) }}</template>
      <template #cell-is_admin="{ row }">
        <KSwitch
          :model-value="row.is_admin"
          :disabled="isSelf(row)"
          :title="isSelf(row) ? t('admin.selfRole') : undefined"
          :data-testid="`admin-role-${row.email}`"
          @update:model-value="users.requestRoleChange(row, $event)"
        />
      </template>
    </KTable>

    <KrDialog :open="users.roleChange.value !== null" @update:open="users.cancelRoleChange">
      <template #title>{{ users.roleChange.value?.isAdmin ? t("admin.grantTitle") : t("admin.revokeTitle") }}</template>
      <p :class="$style.sub">
        {{
          users.roleChange.value?.isAdmin
            ? t("admin.grantText", { email: users.roleChange.value?.user.email ?? "" })
            : t("admin.revokeText", { email: users.roleChange.value?.user.email ?? "" })
        }}
      </p>
      <template #footer>
        <KrButton variant="secondary" @click="users.cancelRoleChange">{{ t("admin.cancel") }}</KrButton>
        <KrButton
          :variant="users.roleChange.value?.isAdmin ? 'primary' : 'danger'"
          :loading="users.savingRole.value"
          data-testid="admin-role-confirm"
          @click="users.confirmRoleChange"
        >
          {{ users.roleChange.value?.isAdmin ? t("admin.grant") : t("admin.revoke") }}
        </KrButton>
      </template>
    </KrDialog>
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
  margin: 0;
  color: var(--kr-text-muted);
  font-size: var(--kr-font-size-xs);
}
</style>
