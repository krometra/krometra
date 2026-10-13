// ConstraintSolver — wraps Web Worker for constraint solving
import type { SketchEntity, SketchConstraint } from "@/types/api";

export interface SolverOutput {
  entities: SketchEntity[];
  converged: boolean;
  residual: number;
}

export class ConstraintSolver {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("../../workers/constraint-solver.worker.ts", import.meta.url),
      { type: "module" }
    );
  }

  solve(entities: SketchEntity[], constraints: SketchConstraint[]): Promise<SolverOutput> {
    return new Promise((resolve) => {
      this.worker.onmessage = (e: MessageEvent<SolverOutput>) => {
        resolve(e.data);
      };
      this.worker.onerror = () => {
        resolve({ entities, converged: false, residual: Infinity });
      };
      // Vue-реактивные объекты — Proxy, их structuredClone не переносит в воркер:
      // postMessage бросает DataCloneError. Отправляем простые копии.
      this.worker.postMessage(
        JSON.parse(JSON.stringify({ entities, constraints }))
      );
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
