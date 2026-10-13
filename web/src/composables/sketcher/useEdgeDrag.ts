import type { Ref } from "vue";
import type { SketchEntity, SketchPoint } from "@/types/api";

interface EdgeDragState {
  lineId: string;
  origStart: SketchPoint;
  origEnd: SketchPoint;
  axis: "x" | "y" | "free";
  startWorld: SketchPoint;
  moved: boolean;
  followers: { lineId: string; endpoint: "start" | "end"; follows: "start" | "end" }[];
}

const COINCIDENT_EPS = 1e-4;
const DRAG_THRESHOLD_PX = 3;

/**
 * Перетаскивание стороны эскиза: тянем отрезок, соседние линии тянутся за
 * совпадающими концами.
 */
export function useEdgeDrag(deps: {
  entities: Ref<SketchEntity[]>;
  zoom: () => number;
  screenToWorld: (sx: number, sy: number) => SketchPoint;
  emitChanged: () => void;
  toggleSelection: (entityId: string) => void;
}) {
  const { entities, zoom, screenToWorld, emitChanged, toggleSelection } = deps;

  let drag: EdgeDragState | null = null;

  const isDragging = () => drag !== null;

  function start(line: SketchEntity & { type: "line" }, world: SketchPoint) {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const axis: EdgeDragState["axis"] =
      Math.abs(dy) < COINCIDENT_EPS ? "y" : Math.abs(dx) < COINCIDENT_EPS ? "x" : "free";

    const near = (a: SketchPoint, b: SketchPoint) =>
      Math.hypot(a.x - b.x, a.y - b.y) < COINCIDENT_EPS;
    const followers: EdgeDragState["followers"] = [];
    for (const e of entities.value) {
      if (e.id === line.id || e.type !== "line") continue;
      for (const endpoint of ["start", "end"] as const) {
        for (const follows of ["start", "end"] as const) {
          if (near(e[endpoint], line[follows])) {
            followers.push({ lineId: e.id, endpoint, follows });
          }
        }
      }
    }

    drag = {
      lineId: line.id,
      origStart: { ...line.start },
      origEnd: { ...line.end },
      axis,
      startWorld: world,
      moved: false,
      followers,
    };
  }

  function update(screenX: number, screenY: number) {
    const current = drag;
    if (!current) return;
    const world = screenToWorld(screenX, screenY);
    let dx = world.x - current.startWorld.x;
    let dy = world.y - current.startWorld.y;

    if (!current.moved && Math.hypot(dx, dy) * zoom() < DRAG_THRESHOLD_PX) return;
    current.moved = true;

    if (current.axis === "y") dx = 0;
    if (current.axis === "x") dy = 0;

    const newStart = { x: current.origStart.x + dx, y: current.origStart.y + dy };
    const newEnd = { x: current.origEnd.x + dx, y: current.origEnd.y + dy };

    entities.value = entities.value.map((e) => {
      if (e.type !== "line") return e;
      if (e.id === current.lineId) return { ...e, start: newStart, end: newEnd };
      const efs = current.followers.filter((f) => f.lineId === e.id);
      if (efs.length === 0) return e;
      const updated = { ...e, start: { ...e.start }, end: { ...e.end } };
      for (const f of efs) {
        updated[f.endpoint] = f.follows === "start" ? { ...newStart } : { ...newEnd };
      }
      return updated;
    });
  }

  function finish() {
    const current = drag;
    drag = null;
    if (!current) return;
    if (current.moved) emitChanged();
    else toggleSelection(current.lineId);
  }

  function cancel() {
    drag = null;
  }

  return { isDragging, start, update, finish, cancel };
}

export type EdgeDragApi = ReturnType<typeof useEdgeDrag>;
