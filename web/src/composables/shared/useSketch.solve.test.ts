import { describe, expect, it, vi } from "vitest";
import type { SketchEntity } from "@/types/api";

const pending: ((value: { entities: SketchEntity[]; converged: boolean; residual: number }) => void)[] = [];

vi.mock("@/sketcher/solver/ConstraintSolver", () => ({
  ConstraintSolver: class {
    solve() {
      return new Promise((resolve) => pending.push(resolve));
    }
    terminate() {}
  },
}));

const { useSketch } = await import("./useSketch");

const ring: SketchEntity = { id: "ring", type: "circle", center: { x: 0, y: 0 }, radius: 10 };

describe("useSketch.solve", () => {
  it("правка, сделанная пока решатель считал, не затирается его устаревшим результатом", async () => {
    const sketch = useSketch();
    sketch.startSketch("s1");
    sketch.applyCanvasEdit([ring], []);
    const solving = sketch.solve();
    sketch.applyCanvasEdit([{ ...ring, construction: true }], []);
    pending.shift()!({ entities: [ring], converged: true, residual: 0 });
    await solving;
    expect(sketch.entities.value).toEqual([{ ...ring, construction: true }]);
  });

  it("без правок результат решателя принимается", async () => {
    const sketch = useSketch();
    sketch.startSketch("s2");
    sketch.applyCanvasEdit([ring], []);
    const solving = sketch.solve();
    pending.shift()!({ entities: [ring], converged: true, residual: 0.25 });
    await solving;
    expect(sketch.solveResidual.value).toBe(0.25);
    expect(sketch.entities.value).toEqual([ring]);
  });
});
