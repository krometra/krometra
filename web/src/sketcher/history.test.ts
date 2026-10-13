import { describe, it, expect } from "vitest";
import { createSketchHistory, type SketchSnapshot } from "./history";
import type { SketchConstraint, SketchEntity } from "@/types/api";

function line(id: string): SketchEntity {
  return {
    id,
    type: "line",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 10 },
  } as SketchEntity;
}

function constraint(id: string): SketchConstraint {
  return { id, type: "horizontal", anchors: [{ entity_id: "e1" }] } as SketchConstraint;
}

function snap(entityIds: string[], constraintIds: string[] = []): SketchSnapshot {
  return {
    entities: entityIds.map(line),
    constraints: constraintIds.map(constraint),
  };
}

const ids = (s: SketchSnapshot | null) => s?.entities.map((e) => e.id) ?? [];

describe("createSketchHistory", () => {
  it("has nothing to undo on a fresh sketch", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toBeNull();
  });

  it("undoes a single edit back to the baseline", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    h.commit(snap(["a"]));

    expect(h.canUndo.value).toBe(true);
    expect(ids(h.undo())).toEqual([]);
  });

  it("walks back through several edits in order", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    h.commit(snap(["a"]));
    h.commit(snap(["a", "b"]));
    h.commit(snap(["a", "b", "c"]));

    expect(ids(h.undo())).toEqual(["a", "b"]);
    expect(ids(h.undo())).toEqual(["a"]);
    expect(ids(h.undo())).toEqual([]);
    expect(h.canUndo.value).toBe(false);
  });

  it("redoes what was undone", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    h.commit(snap(["a"]));
    h.commit(snap(["a", "b"]));

    h.undo();
    expect(h.canRedo.value).toBe(true);
    expect(ids(h.redo())).toEqual(["a", "b"]);
    expect(h.canRedo.value).toBe(false);
  });

  it("drops the redo branch after a new edit", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    h.commit(snap(["a"]));
    h.undo();
    h.commit(snap(["z"]));

    expect(h.canRedo.value).toBe(false);
    expect(h.redo()).toBeNull();
  });

  it("tracks constraints alongside entities", () => {
    const h = createSketchHistory();
    h.reset(snap(["a"]));
    h.commit(snap(["a"], ["c1"]));

    const back = h.undo();
    expect(back?.constraints).toEqual([]);
    expect(ids(back)).toEqual(["a"]);
  });

  it("returns copies so later edits cannot mutate history", () => {
    const h = createSketchHistory();
    const initial = snap(["a"]);
    h.reset(initial);
    h.commit(snap(["a", "b"]));

    // Mutating the caller's array must not corrupt the stored snapshot.
    initial.entities.push(line("ghost"));
    const back = h.undo();
    expect(ids(back)).toEqual(["a"]);

    // Mutating a returned snapshot must not corrupt history either.
    back!.entities.push(line("ghost2"));
    h.redo();
    expect(ids(h.undo())).toEqual(["a"]);
  });

  it("reset clears both stacks for a newly opened sketch", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    h.commit(snap(["a"]));
    h.undo();
    expect(h.canRedo.value).toBe(true);

    h.reset(snap(["fresh"]));
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
  });

  it("keeps history bounded but still undoable", () => {
    const h = createSketchHistory();
    h.reset(snap([]));
    for (let i = 0; i < 250; i++) {
      h.commit(snap([`e${i}`]));
    }
    expect(h.canUndo.value).toBe(true);
    // Should not grow without bound; undo still returns a valid snapshot.
    expect(ids(h.undo())).toEqual(["e248"]);
  });
});
