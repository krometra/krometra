// Глобальные тосты через KrToast (регистрирует window.__csToast в App.vue)

type ToastType = "success" | "error" | "warning" | "info";

interface ToastApi {
  addToast: (message: string, type?: ToastType, duration?: number) => void;
}

export function toast(message: string, type: ToastType = "info") {
  const api = (window as unknown as { __csToast?: ToastApi }).__csToast;
  api?.addToast(message, type);
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { error_description?: string; detail?: { error_description?: string } };
  return (
    e?.error_description ??
    e?.detail?.error_description ??
    (err instanceof Error && err.message ? err.message : fallback)
  );
}

export function toastApiError(err: unknown, fallback: string): string {
  const message = apiErrorMessage(err, fallback);
  toast(message, "error");
  return message;
}
