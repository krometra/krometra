import { afterAll, type BenchOptions, type BenchTask } from "vitest";

export const SMOKE_RUN = import.meta.env.MODE === "smoke";

const SINGLE_PASS: BenchOptions = { time: 0, iterations: 1, warmupTime: 0, warmupIterations: 0 };

const measured = new Set<BenchTask>();

function tier(full: BenchOptions): BenchOptions {
  return {
    ...(SMOKE_RUN ? SINGLE_PASS : full),
    setup: (task) => {
      measured.add(task);
    },
  };
}

afterAll(() => {
  for (const task of measured) {
    if (task.result?.error) throw task.result.error;
  }
});

export const MICRO = tier({ time: 300, warmupTime: 100 });
export const KERNEL = tier({ time: 500, iterations: 10, warmupTime: 0, warmupIterations: 2 });
export const HEAVY = tier({ time: 0, iterations: 5, warmupTime: 0, warmupIterations: 1 });
