import { ref, shallowRef } from "vue";
import { useApi } from "@/composables/useApi";
import { toast } from "@/composables/useToast";
import { errorMessage } from "@/lib/apiError";
import type { AdminUserRole, AdminUserRow, AdminUserSort } from "@/types/api";
import { useAdminTable, type AdminClient } from "./useAdminTable";

export const ADMIN_USER_SORTS: readonly AdminUserSort[] = [
  "email", "display_name", "created_at", "is_admin", "projects", "storage_bytes", "operations", "last_activity_at", "last_seen_at",
];

export interface RoleChange {
  user: AdminUserRow;
  isAdmin: boolean;
}

export function useAdminUsers(api: AdminClient = useApi()) {
  const table = useAdminTable<AdminUserSort, AdminUserRow>(
    "/admin/users",
    { sort: "created_at", order: "desc", page: 1, pageSize: 25, q: "" },
    ADMIN_USER_SORTS,
    api,
  );
  const roleChange = shallowRef<RoleChange | null>(null);
  const savingRole = ref(false);

  function requestRoleChange(user: AdminUserRow, isAdmin: boolean) {
    roleChange.value = { user, isAdmin };
  }

  function cancelRoleChange() {
    roleChange.value = null;
  }

  async function confirmRoleChange() {
    const change = roleChange.value;
    if (!change) return;
    savingRole.value = true;
    try {
      const updated = await api.patch<AdminUserRole>(`/admin/users/${change.user.id}`, { is_admin: change.isAdmin });
      table.patchRow(updated.id, { is_admin: updated.is_admin });
      toast(updated.is_admin ? `${updated.email} теперь администратор` : `${updated.email} больше не администратор`, "success");
      roleChange.value = null;
    } catch (error) {
      toast(errorMessage(error, "Не удалось изменить роль."), "error");
    } finally {
      savingRole.value = false;
    }
  }

  return { ...table, roleChange, savingRole, requestRoleChange, cancelRoleChange, confirmRoleChange };
}
