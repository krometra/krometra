<script setup lang="ts">
import { onMounted } from "vue";
import { FxSwitch, FxTable } from "foxy-ui-kit";
import { useAuth } from "@/composables/shared/useAuth";
import { useAdminUsers } from "@/composables/admin/useAdminUsers";
import { formatAuthMethods, formatCount, formatDate, formatRelative, formatStorage } from "@/lib/admin/format";
import type { AdminUserRow } from "@/types/api";
import CsButton from "@/components/ui/CsButton.vue";
import CsDialog from "@/components/ui/CsDialog.vue";
import AdminTableToolbar from "./AdminTableToolbar.vue";

const auth = useAuth();
const users = useAdminUsers();

const columns = [
  { key: "email", label: "Пользователь", sortable: true },
  { key: "created_at", label: "Регистрация", sortable: true, nowrap: true },
  { key: "projects", label: "Проекты", sortable: true, align: "right" },
  { key: "operations", label: "Операции", sortable: true, align: "right" },
  { key: "storage_bytes", label: "Хранилище", sortable: true, align: "right", nowrap: true },
  { key: "last_activity_at", label: "Последняя правка", sortable: true, nowrap: true },
  { key: "auth_methods", label: "Вход" },
  { key: "is_admin", label: "Админ", sortable: true, actions: true },
];

function isSelf(row: AdminUserRow) {
  return row.id === auth.user.value?.id;
}

onMounted(users.load);
</script>

<template>
  <div :class="$style.root" data-testid="admin-users">
    <AdminTableToolbar
      :search="users.search.value"
      placeholder="Поиск по почте или имени"
      :total="users.total.value"
      :failure="users.failure.value"
      failure-text="Не удалось загрузить пользователей."
      data-testid="admin-users-search"
      @search="users.setSearch"
    />
    <FxTable
      :columns="columns"
      :rows="users.rows.value"
      :loading="users.loading.value && !users.rows.value.length"
      :sort-key="users.state.value.sort"
      :sort-dir="users.state.value.order"
      :page="users.state.value.page"
      :page-size="users.state.value.pageSize"
      :total="users.total.value"
      empty-text="Пользователи не найдены"
      dense
      @update:sort-key="users.setSortKey"
      @update:sort-dir="users.setSortOrder"
      @update:page="users.setPage"
    >
      <template #cell-email="{ row }">
        <div :class="$style.name">{{ row.display_name || row.email }}</div>
        <div v-if="row.display_name && row.display_name !== row.email" :class="$style.sub">{{ row.email }}</div>
      </template>
      <template #cell-created_at="{ row }">{{ formatDate(row.created_at) }}</template>
      <template #cell-projects="{ row }">{{ formatCount(row.projects) }}</template>
      <template #cell-operations="{ row }">{{ formatCount(row.operations) }}</template>
      <template #cell-storage_bytes="{ row }">{{ formatStorage(row.storage_bytes) }}</template>
      <template #cell-last_activity_at="{ row }">{{ formatRelative(row.last_activity_at) }}</template>
      <template #cell-auth_methods="{ row }">{{ formatAuthMethods(row.auth_methods) }}</template>
      <template #cell-is_admin="{ row }">
        <FxSwitch
          :model-value="row.is_admin"
          :disabled="isSelf(row)"
          :title="isSelf(row) ? 'Свою роль снять нельзя' : undefined"
          :data-testid="`admin-role-${row.email}`"
          @update:model-value="users.requestRoleChange(row, $event)"
        />
      </template>
    </FxTable>

    <CsDialog :open="users.roleChange.value !== null" @update:open="users.cancelRoleChange">
      <template #title>{{ users.roleChange.value?.isAdmin ? "Назначить администратором?" : "Снять роль администратора?" }}</template>
      <p :class="$style.sub">
        {{
          users.roleChange.value?.isAdmin
            ? `${users.roleChange.value?.user.email} получит доступ к аналитике и управлению ролями.`
            : `${users.roleChange.value?.user.email} потеряет доступ к странице администрирования.`
        }}
      </p>
      <template #footer>
        <CsButton variant="secondary" @click="users.cancelRoleChange">Отмена</CsButton>
        <CsButton
          :variant="users.roleChange.value?.isAdmin ? 'primary' : 'danger'"
          :loading="users.savingRole.value"
          data-testid="admin-role-confirm"
          @click="users.confirmRoleChange"
        >
          {{ users.roleChange.value?.isAdmin ? "Назначить" : "Снять роль" }}
        </CsButton>
      </template>
    </CsDialog>
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
  margin: 0;
  color: var(--cs-text-muted);
  font-size: var(--cs-font-size-xs);
}
</style>
