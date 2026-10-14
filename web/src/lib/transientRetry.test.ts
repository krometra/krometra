import { describe, expect, it } from "vitest";
import { ApiError } from "./apiError";
import { isTransientFailure, retryTransient } from "./transientRetry";

const noSleep = () => Promise.resolve();

describe("retryTransient", () => {
  it("повторяет запрос, пока сервер недоступен", async () => {
    const failures = [new ApiError(502, "error", "502"), new ApiError(0, "network_error", "нет связи")];
    const slept: number[] = [];
    const result = await retryTransient(
      async () => {
        const failure = failures.shift();
        if (failure) throw failure;
        return "ok";
      },
      [10, 20, 30],
      async (ms) => void slept.push(ms),
    );
    expect(result).toBe("ok");
    expect(slept).toEqual([10, 20]);
  });

  it("не повторяет отказ по существу", async () => {
    let calls = 0;
    await expect(
      retryTransient(async () => {
        calls++;
        throw new ApiError(409, "version_conflict", "конфликт");
      }, [10], noSleep),
    ).rejects.toThrow("конфликт");
    expect(calls).toBe(1);
  });

  it("после исчерпания попыток отдаёт последнюю ошибку", async () => {
    let calls = 0;
    await expect(
      retryTransient(async () => {
        calls++;
        throw new ApiError(503, "error", "503");
      }, [1, 1], noSleep),
    ).rejects.toThrow("503");
    expect(calls).toBe(3);
  });

  it("временными считает только обрыв связи и 502-504", () => {
    expect(isTransientFailure(new ApiError(504, "error", ""))).toBe(true);
    expect(isTransientFailure(new ApiError(500, "error", ""))).toBe(false);
    expect(isTransientFailure(new Error("x"))).toBe(false);
  });
});
