// API client with JWT interceptor and automatic token refresh
// Does NOT use localStorage for tokens — only in-memory

import { useAuth } from "./shared/useAuth";
import { useI18n } from "./shared/useI18n";
import { ApiError, saveFailure, toApiError } from "@/lib/apiError";
import { isTransientFailure, retryTransient } from "@/lib/transientRetry";

const BASE_URL = "/api";

function isRefreshEndpoint(path: string): boolean {
  return path.startsWith("/auth/refresh");
}

async function failure(response: Response, fallback: string, translateError?: import("@/lib/apiError").ErrorTranslator): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  return toApiError(response.status, body, fallback, translateError);
}

let refreshingPromise: Promise<boolean> | null = null;

export function useApi() {
  const auth = useAuth();
  const { t, tMessage, locale } = useI18n();
  const translateError: import("@/lib/apiError").ErrorTranslator = (key, values) => tMessage({ key, values });

  async function refreshTokens(): Promise<boolean> {
    if (refreshingPromise) {
      return refreshingPromise;
    }

    refreshingPromise = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include", // sends httpOnly cookie
        });

        if (!response.ok) {
          auth.clearAuth();
          return false;
        }

        const data = await response.json();
        auth.setAccessToken(data.access_token);
        return true;
      } catch {
        auth.clearAuth();
        return false;
      } finally {
        refreshingPromise = null;
      }
    })();

    return refreshingPromise;
  }

  async function request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (auth.accessToken.value) {
      headers["Authorization"] = `Bearer ${auth.accessToken.value}`;
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } catch {
      throw new ApiError(0, "network_error", t("errors.network_error"));
    }

    // 401 на самом /auth/refresh — это «сессии нет», а не «токен протух»:
    // повторный refresh здесь только удваивал серию 401 у анонима.
    if (response.status === 401 && !isRefreshEndpoint(path) && !auth.isRefreshing.value) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        // Retry with new token
        headers["Authorization"] = `Bearer ${auth.accessToken.value}`;
        response = await fetch(`${BASE_URL}${path}`, {
          ...options,
          headers,
          credentials: "include",
        });
      }
    }

    if (!response.ok) {
      throw await failure(response, response.statusText, locale.value === "ru" ? undefined : translateError);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async function multipart<T>(method: "POST" | "PUT", path: string, body: FormData): Promise<T> {
    try {
      return await retryTransient(() => multipartOnce<T>(method, path, body));
    } catch (error) {
      if (isTransientFailure(error)) throw saveFailure(error as ApiError, t("errors.saveFailed"));
      throw error;
    }
  }

  async function multipartOnce<T>(method: "POST" | "PUT", path: string, body: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    if (auth.accessToken.value) {
      headers["Authorization"] = `Bearer ${auth.accessToken.value}`;
    }
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, { method, headers, body, credentials: "include" });
    } catch {
      throw new ApiError(0, "network_error", t("errors.network_error"));
    }
    if (response.status === 401 && !auth.isRefreshing.value) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${auth.accessToken.value}`;
        response = await fetch(`${BASE_URL}${path}`, { method, headers, body, credentials: "include" });
      }
    }
    if (!response.ok) throw await failure(response, response.statusText, locale.value === "ru" ? undefined : translateError);
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  return {
    get: <T>(path: string) => retryTransient(() => request<T>(path)),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    put: <T>(path: string, body: unknown) =>
      request<T>(path, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

    multipartPost: <T>(path: string, body: FormData) => multipart<T>("POST", path, body),
    multipartPut: <T>(path: string, body: FormData) => multipart<T>("PUT", path, body),

    // Form-encoded POST for OAuth2 token endpoint
    formPost: async <T>(path: string, body: Record<string, string>): Promise<T> => {
      const formBody = new URLSearchParams(body).toString();
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formBody,
          credentials: "include",
        });
      } catch {
        throw new ApiError(0, "network_error", t("errors.network_error"));
      }

      if (!response.ok) {
        throw await failure(response, response.statusText, locale.value === "ru" ? undefined : translateError);
      }

      return response.json();
    },

    // Binary download with auth
    blob: async (path: string): Promise<{ blob: Blob; filename: string }> => {
      const headers: Record<string, string> = {};
      if (auth.accessToken.value) {
        headers["Authorization"] = `Bearer ${auth.accessToken.value}`;
      }
      let response = await fetch(`${BASE_URL}${path}`, {
        headers,
        credentials: "include",
      });
      // 401 → refresh → retry
      if (response.status === 401 && !auth.isRefreshing.value) {
        const refreshed = await refreshTokens();
        if (refreshed) {
          headers["Authorization"] = `Bearer ${auth.accessToken.value}`;
          response = await fetch(`${BASE_URL}${path}`, {
            headers,
            credentials: "include",
          });
        }
      }
      if (!response.ok) throw await failure(response, t("errors.downloadFailed"), locale.value === "ru" ? undefined : translateError);
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] ?? "export";
      return { blob, filename };
    },
  };
}
