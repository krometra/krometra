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

export interface RebuildFailure {
  entryId: string;
  message: string;
}

export interface RebuildOutcome<T> {
  shapes: Map<string, T>;
  seats: Map<string, SketchSeatPlacement>;
  failures: RebuildFailure[];
  hits: number;
}

function seatedStep(step: RebuildStep, seats: Map<string, SketchSeatPlacement>): RebuildStep {
  const seat = step.sketchId ? seats.get(step.sketchId) : undefined;
  return seat ? { ...step, request: { ...step.request, ...seat } } : step;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MISSING_BODY = "Тело, на которое опирается операция, удалено или не построилось.";

class RebuildRun<T> {
  private produced = new Map<string, { key: string; shape: T }>();
  private aliases = new Map<string, string | null>();
  private seats = new Map<string, SketchSeatPlacement>();
  private seatFailures = new Map<string, string>();
  private failures = new Map<string, string>();
  private pinned = new Set<string>();
  private hits = 0;

  constructor(private backend: RebuildBackend<T>, private cache: RebuildCache<T>) {}

  private resolve(bodyId: string): string | null {
    const seen = new Set<string>();
    let current: string | null = bodyId;
    while (current !== null && this.aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.aliases.get(current) ?? null;
    }
    return current;
  }

  private keyOf(bodyId: string): string {
    const resolved = this.resolve(bodyId);
    if (resolved === null) return "missing";
    return this.produced.get(resolved)?.key ?? `body:${resolved}@${this.backend.revision(resolved)}`;
  }

  private readonly lookup = (bodyId: string): T => {
    const resolved = this.resolve(bodyId);
    if (resolved === null) throw new Error(MISSING_BODY);
    return this.produced.get(resolved)?.shape ?? this.backend.load(resolved);
  };

  alias(bodyId: string, fallbackBodyId: string | null) {
    this.produced.delete(bodyId);
    this.aliases.set(bodyId, fallbackBodyId);
  }

  fail(entryId: string, outputBodyId: string, fallbackBodyId: string | null, message: string) {
    this.failures.set(entryId, message);
    this.alias(outputBodyId, fallbackBodyId);
  }

  seat(step: SketchSeatStep) {
    try {
      this.seats.set(step.sketchId, this.backend.seat(step, this.lookup(step.bodyId)));
      this.seatFailures.delete(step.sketchId);
      this.failures.delete(step.entryId);
    } catch (error) {
      this.seats.delete(step.sketchId);
      this.seatFailures.set(step.sketchId, messageOf(error));
      this.failures.set(step.entryId, messageOf(error));
    }
  }

  private shapeOf(step: RebuildStep, key: string): T {
    const cached = this.cache.get(key);
    if (cached === undefined) return this.backend.build(step, this.lookup);
    this.hits++;
    return cached;
  }

  build(planned: RebuildStep) {
    const seatFailure = planned.sketchId ? this.seatFailures.get(planned.sketchId) : undefined;
    try {
      if (seatFailure) throw new Error(seatFailure);
      const step = seatedStep(planned, this.seats);
      const key = rebuildStepKey(step, step.inputBodyIds.map((bodyId) => this.keyOf(bodyId)));
      const shape = this.shapeOf(step, key);
      this.pinned.add(key);
      this.cache.set(key, shape, this.pinned);
      this.aliases.delete(step.outputBodyId);
      this.produced.set(step.outputBodyId, { key, shape });
    } catch (error) {
      if (planned.required) throw error;
      this.fail(planned.entryId, planned.outputBodyId, planned.fallbackBodyId, messageOf(error));
    }
  }

  outcome(): RebuildOutcome<T> {
    return {
      shapes: new Map([...this.produced].map(([bodyId, { shape }]) => [bodyId, shape])),
      seats: this.seats,
      failures: [...this.failures].map(([entryId, message]) => ({ entryId, message })),
      hits: this.hits,
    };
  }
}

export function runRebuild<T>(steps: RebuildPlanStep[], backend: RebuildBackend<T>, cache: RebuildCache<T>): RebuildOutcome<T> {
  const run = new RebuildRun(backend, cache);
  for (const step of steps) {
    if (step.kind === "alias") run.alias(step.bodyId, step.fallbackBodyId);
    else if (step.kind === "fail") run.fail(step.entryId, step.outputBodyId, step.fallbackBodyId, step.message);
    else if (step.kind === "sketch_plane") run.seat(step);
    else run.build(step);
  }
  return run.outcome();
}
