import { stableHash } from "./browserNaming";
import type { RebuildPlanStep, RebuildStep } from "./browserRebuildPlan";
import type { SketchSeatPlacement, SketchSeatStep } from "./browserSketchSeat";

export interface RebuildBackend<T> {
  build(step: RebuildStep, lookup: (bodyId: string) => T): T;
  seat(step: SketchSeatStep, owner: T): SketchSeatPlacement;
  load(bodyId: string): T;
  revision(bodyId: string): number;
  dispose(shape: T): void;
}

export class RebuildCache<T> {
  private entries = new Map<string, T>();

  constructor(private capacity: number, private dispose: (shape: T) => void) {}

  get(key: string): T | undefined {
    const shape = this.entries.get(key);
    if (shape === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, shape);
    return shape;
  }

  set(key: string, shape: T, pinned: Set<string>) {
    this.entries.set(key, shape);
    for (const [oldest, old] of this.entries) {
      if (this.entries.size <= this.capacity) break;
      if (pinned.has(oldest)) continue;
      this.entries.delete(oldest);
      this.dispose(old);
    }
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.forEach((shape) => this.dispose(shape));
    this.entries.clear();
  }
}

export function rebuildStepKey(step: RebuildStep, inputKeys: string[]): string {
  return stableHash(JSON.stringify({ kind: step.kind, request: step.request, inputs: inputKeys }));
}

export interface RebuildOutcome<T> {
  shapes: Map<string, T>;
  seats: Map<string, SketchSeatPlacement>;
  hits: number;
}

function seatedStep(step: RebuildStep, seats: Map<string, SketchSeatPlacement>): RebuildStep {
  const seat = step.sketchId ? seats.get(step.sketchId) : undefined;
  return seat ? { ...step, request: { ...step.request, ...seat } } : step;
}

export function runRebuild<T>(steps: RebuildPlanStep[], backend: RebuildBackend<T>, cache: RebuildCache<T>): RebuildOutcome<T> {
  const produced = new Map<string, { key: string; shape: T }>();
  const seats = new Map<string, SketchSeatPlacement>();
  const pinned = new Set<string>();
  let hits = 0;
  const keyOf = (bodyId: string) => produced.get(bodyId)?.key ?? `body:${bodyId}@${backend.revision(bodyId)}`;
  const lookup = (bodyId: string) => produced.get(bodyId)?.shape ?? backend.load(bodyId);
  for (const planned of steps) {
    if (planned.kind === "sketch_plane") {
      seats.set(planned.sketchId, backend.seat(planned, lookup(planned.bodyId)));
      continue;
    }
    const step = seatedStep(planned, seats);
    const key = rebuildStepKey(step, step.inputBodyIds.map(keyOf));
    let shape = cache.get(key);
    if (shape === undefined) shape = backend.build(step, lookup);
    else hits++;
    pinned.add(key);
    cache.set(key, shape, pinned);
    produced.set(step.outputBodyId, { key, shape });
  }
  return { shapes: new Map([...produced].map(([bodyId, { shape }]) => [bodyId, shape])), seats, hits };
}
