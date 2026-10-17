import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { useAdminOverview } from "./useAdminOverview";

describe("useAdminOverview", () => {
  it("грузит выбранный период и перезагружает при смене", async () => {
    const get = vi.fn(async (path: string) => ({ period_days: Number(path.split("=")[1]) }));
    const overview = useAdminOverview(30, { get } as never);
    await overview.load();
    expect(get).toHaveBeenCalledWith("/admin/overview?days=30");
    overview.setPeriod(7);
    await nextTick();
    await Promise.resolve();
    expect(get).toHaveBeenLastCalledWith("/admin/overview?days=7");
    expect(overview.overview.value?.period_days).toBe(7);
  });

  it("опоздавший ответ старого периода не перетирает новый", async () => {
    let releaseSlow: (value: unknown) => void = () => {};
    const get = vi.fn((path: string) =>
      path.endsWith("=90") ? new Promise((resolve) => (releaseSlow = resolve)) : Promise.resolve({ period_days: 7 }),
    );
    const overview = useAdminOverview(90, { get } as never);
    const slow = overview.load();
    overview.setPeriod(7);
    await nextTick();
    await Promise.resolve();
    releaseSlow({ period_days: 90 });
    await slow;
    expect(overview.overview.value?.period_days).toBe(7);
    expect(overview.loading.value).toBe(false);
  });
});
