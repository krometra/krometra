// Undo/redo for sketch editing — snapshots of entities + constraints.
//
// The sketcher mutates plain arrays (entities/constraints) rather than running
// server commands, so it cannot use the feature-level CommandHistory. Ctrl+Z
// inside a sketch used to fall through to that command history and undo the
// *previous model feature* instead, which silently rolled the document back.

import { ref, computed } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";

export interface SketchSnapshot {
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

const MAX_DEPTH = 100;

function clone(snapshot: SketchSnapshot): SketchSnapshot {
  return {
    entities: snapshot.entities.map((e) => ({ ...e })),
    constraints: snapshot.constraints.map((c) => ({ ...c })),
  };
}

export function createSketchHistory() {
  const past = ref<SketchSnapshot[]>([]);
  const future = ref<SketchSnapshot[]>([]);
  const present = ref<SketchSnapshot | null>(null);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  /** Start a fresh session: the loaded sketch becomes the baseline. */
  function reset(snapshot: SketchSnapshot) {
    past.value = [];
    future.value = [];
    present.value = clone(snapshot);
  }

  /** Record a new state after a user edit. */
  function commit(snapshot: SketchSnapshot) {
    if (present.value) {
      past.value = [...past.value, present.value].slice(-MAX_DEPTH);
    }
    present.value = clone(snapshot);
    future.value = [];
  }

  /**
   * Update the current state *without* adding a step.
   *
   * Used for the constraint solver's write-back: it is a consequence of the
   * edit that was just recorded, not a separate user action. Recording it
   * would push a new entry on every solve, and undo would never terminate.
   */
  function amend(snapshot: SketchSnapshot) {
    present.value = clone(snapshot);
  }

  function undo(): SketchSnapshot | null {
    const previous = past.value[past.value.length - 1];
    if (!previous || !present.value) return null;
    past.value = past.value.slice(0, -1);
    future.value = [present.value, ...future.value];
    present.value = previous;
    return clone(previous);
  }

  function redo(): SketchSnapshot | null {
    const next = future.value[0];
    if (!next || !present.value) return null;
    future.value = future.value.slice(1);
    past.value = [...past.value, present.value];
    present.value = next;
    return clone(next);
  }

  return { canUndo, canRedo, reset, commit, amend, undo, redo };
}

export type SketchHistory = ReturnType<typeof createSketchHistory>;
