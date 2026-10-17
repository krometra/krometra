import type { AdminProjectRow, AdminProjectSort } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { useAdminTable, type AdminClient } from "./useAdminTable";

export const ADMIN_PROJECT_SORTS: readonly AdminProjectSort[] = [
  "name", "owner_email", "created_at", "updated_at", "storage_bytes", "operations", "bodies", "sketches", "document_version",
];

export function useAdminProjects(api: AdminClient = useApi()) {
  return useAdminTable<AdminProjectSort, AdminProjectRow>(
    "/admin/projects",
    { sort: "updated_at", order: "desc", page: 1, pageSize: 25, q: "" },
    ADMIN_PROJECT_SORTS,
    api,
  );
}
