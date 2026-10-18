import { useApi } from "@/composables/useApi";

export type PasswordClient = Pick<ReturnType<typeof useApi>, "post">;

export function usePasswordActions(api: PasswordClient = useApi()) {
  function requestReset(email: string): Promise<void> {
    return api.post<void>("/auth/password/forgot", { email: email.trim() });
  }

  function resetPassword(token: string, newPassword: string): Promise<void> {
    return api.post<void>("/auth/password/reset", { token, new_password: newPassword });
  }

  function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return api.post<void>("/auth/password/change", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  return { requestReset, resetPassword, changePassword };
}
