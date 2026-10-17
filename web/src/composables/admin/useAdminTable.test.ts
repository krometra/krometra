import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ApiError } from "@/lib/apiError";
import type { AdminClient } from "./useAdminTable";
import { useAdminProjects } from "./useAdminProjects";
import { useAdminUsers } from "./useAdminUsers";
import type { AdminUserRow } from "@/types/api";

function user(id: string, isAdmin = false): AdminUserRow {
  return {
    id, email: `${id}@example.com`, display_name: id, created_at: "2026-10-01T00:00:00Z", is_admin: isAdmin,
    auth_methods: ["password"], projects: 0, storage_bytes: 0, operations: 0, last_activity_at: null, last_seen_at: null, api_keys: 0,
  };
}

function fakeClient(rows: AdminUserRow[] = [user("ann"), user("bob")]) {
  return {
    get: vi.fn(async () => ({ items: rows, total: rows.length })),
    patch: vi.fn(async (path: string, body: { is_admin: boolean }) => ({ id: path.split("/").pop(), email: "x", is_admin: body.is_admin })),
  };
}

const flush = async () => {
  await nextTick();
  await Promise.resolve();
};

describe("useAdminTable", () => {
  it("грузит первую страницу с сортировкой по умолчанию", async () => {
    const client = fakeClient();
    const users = useAdminUsers(client as unknown as AdminClient);
    await users.load();
    expect(client.get).toHaveBeenCalledWith("/admin/users?limit=25&offset=0&sort=created_at&order=desc");
    expect(users.rows.value.map((row) => row.id)).toEqual(["ann", "bob"]);
    expect(users.total.value).toBe(2);
  });

  it("смена колонки и направления из таблицы - один запрос", async () => {
    const client = fakeClient();
    const projects = useAdminProjects(client as unknown as AdminClient);
    projects.setSortKey("bodies");
    projects.setSortOrder("asc");
    await flush();
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith("/admin/projects?limit=25&offset=0&sort=bodies&order=asc");
  });

  it("неразрешённую сортировку игнорирует", async () => {
    const client = fakeClient();
    const users = useAdminUsers(client as unknown as AdminClient);
    users.setSortKey("password_hash");
    await flush();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("страница переводится в смещение", async () => {
    const client = fakeClient();
    const users = useAdminUsers(client as unknown as AdminClient);
    users.setPage(3);
    await flush();
    expect(client.get).toHaveBeenCalledWith("/admin/users?limit=25&offset=50&sort=created_at&order=desc");
  });

  it("поиск уходит в запрос с задержкой и возвращает на первую страницу", async () => {
    vi.useFakeTimers();
    try {
      const client = fakeClient();
      const users = useAdminUsers(client as unknown as AdminClient);
      users.setPage(2);
      await flush();
      users.setSearch("an");
      users.setSearch("ann");
      expect(users.search.value).toBe("ann");
      await vi.advanceTimersByTimeAsync(400);
      await flush();
      expect(client.get).toHaveBeenLastCalledWith("/admin/users?limit=25&offset=0&sort=created_at&order=desc&q=ann");
      expect(client.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ошибку загрузки запоминает", async () => {
    const failure = new ApiError(403, "forbidden", "нет");
    const client = { ...fakeClient(), get: vi.fn(async () => Promise.reject(failure)) };
    const users = useAdminUsers(client as unknown as AdminClient);
    await users.load();
    expect(users.failure.value).toBe(failure);
    expect(users.loading.value).toBe(false);
  });
});

describe("useAdminUsers: роль", () => {
  const addToast = vi.fn();
  beforeEach(() => vi.stubGlobal("window", { __csToast: { addToast } }));
  afterEach(() => vi.unstubAllGlobals());

  it("меняет роль только после подтверждения", async () => {
    const client = fakeClient();
    const users = useAdminUsers(client as unknown as AdminClient);
    await users.load();
    users.requestRoleChange(users.rows.value[1], true);
    expect(client.patch).not.toHaveBeenCalled();
    await users.confirmRoleChange();
    expect(client.patch).toHaveBeenCalledWith("/admin/users/bob", { is_admin: true });
    expect(users.rows.value[1].is_admin).toBe(true);
    expect(users.roleChange.value).toBeNull();
    expect(addToast).toHaveBeenLastCalledWith("x теперь администратор", "success");
  });

  it("отмена ничего не отправляет", async () => {
    const client = fakeClient();
    const users = useAdminUsers(client as unknown as AdminClient);
    await users.load();
    users.requestRoleChange(users.rows.value[0], true);
    users.cancelRoleChange();
    await users.confirmRoleChange();
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("при отказе сервера роль в таблице не меняется", async () => {
    const client = { ...fakeClient(), patch: vi.fn(async () => Promise.reject(new ApiError(400, "cannot_demote_self", "нельзя"))) };
    const users = useAdminUsers(client as unknown as AdminClient);
    await users.load();
    users.requestRoleChange(users.rows.value[0], false);
    await users.confirmRoleChange();
    expect(users.rows.value[0].is_admin).toBe(false);
    expect(users.roleChange.value).not.toBeNull();
    expect(users.savingRole.value).toBe(false);
    expect(addToast).toHaveBeenLastCalledWith("нельзя", "error");
  });
});
