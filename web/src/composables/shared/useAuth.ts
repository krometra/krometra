// Shared auth state (createSharedComposable — singleton)
// Stores access_token in memory only, NEVER in localStorage
// Refresh token is handled transparently via httpOnly cookie

import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { User, TokenResponse } from "@/types/api";
import { useApi } from "../useApi";
import { errorMessage } from "@/lib/apiError";

export const useAuth = createSharedComposable(() => {
  const accessToken = ref<string | null>(null);
  const user = ref<User | null>(null);
  const isAuthenticated = computed(() => !!accessToken.value);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  function setAccessToken(token: string | null) {
    accessToken.value = token;
  }

  function clearAuth() {
    accessToken.value = null;
    user.value = null;
  }

  async function register(email: string, password: string, displayName?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const response = await api.post<{ user: User }>("/auth/register", {
        email,
        password,
        display_name: displayName,
        personal_data_consent: true,
      });
      return response.user;
    } catch (e: unknown) {
      error.value = errorMessage(e, "Не удалось зарегистрироваться.");
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function login(email: string, password: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const response = await api.formPost<TokenResponse>("/auth/token", {
        grant_type: "password",
        username: email,
        password: password,
      });

      accessToken.value = response.access_token;

      // Fetch current user
      const userResponse = await api.get<User>("/auth/me");
      user.value = userResponse;

      return user.value;
    } catch (e: unknown) {
      error.value = errorMessage(e, "Не удалось войти.");
      clearAuth();
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function refresh() {
    try {
      const api = useApi();
      const response = await api.post<TokenResponse>("/auth/refresh");
      accessToken.value = response.access_token;
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  async function logout() {
    try {
      const api = useApi();
      await api.post("/auth/logout");
    } catch {
      // Ignore errors during logout
    }
    clearAuth();
  }

  async function fetchMe() {
    try {
      const api = useApi();
      const response = await api.get<User>("/auth/me");
      user.value = response;
      return response;
    } catch {
      clearAuth();
      throw new Error("Failed to fetch user");
    }
  }

  // Silent-refresh на старте приложения. Гвард роутера вызывает его на каждом
  // переходе, поэтому попытка ровно одна на загрузку страницы: иначе аноним
  // ловил серию 401 /auth/refresh на каждом редиректе.
  const initialized = ref(false);
  let initializing: Promise<boolean> | null = null;

  async function initialize() {
    if (initialized.value) return isAuthenticated.value;
    if (!initializing) {
      initializing = restoreSession().finally(() => {
        initialized.value = true;
        initializing = null;
      });
    }
    return initializing;
  }

  async function restoreSession() {
    try {
      const api = useApi();
      const response = await api.post<TokenResponse>("/auth/refresh");
      accessToken.value = response.access_token;
      const userResponse = await api.get<User>("/auth/me");
      user.value = userResponse;
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  return {
    accessToken,
    user,
    isAuthenticated,
    isLoading,
    isRefreshing: ref(false), // used by useApi to prevent concurrent refreshes
    error,
    setAccessToken,
    clearAuth,
    register,
    login,
    refresh,
    logout,
    fetchMe,
    initialize,
  };
});
