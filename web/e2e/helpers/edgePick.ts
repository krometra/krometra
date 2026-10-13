export interface Edge {
  id: string;
  a: number[];
  b: number[];
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EdgeSpot {
  clearance: number;
  scr: number[];
}

export interface EdgePickPlan extends EdgeSpot {
  pos: number[];
}

const AZIMUTHS = [15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345];
const ELEVATIONS = [-55, -35, 20, 35, 50, 65];
const SAMPLE_STEPS = 24;
const SAMPLE_FROM = 2;
const SAMPLE_TO = 23;
const CANVAS_MARGIN_PX = 20;

const EDGE_SAMPLE_COUNT = SAMPLE_TO - SAMPLE_FROM;

function lerp(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function distToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = vx * vx + vy * vy;
  let t = len ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

export function candidateViews(radius: number): number[][] {
  const views: number[][] = [];
  for (const az of AZIMUTHS) {
    for (const el of ELEVATIONS) {
      const a = (az * Math.PI) / 180;
      const e = (el * Math.PI) / 180;
      views.push([radius * Math.cos(e) * Math.cos(a), radius * Math.cos(e) * Math.sin(a), radius * Math.sin(e)]);
    }
  }
  return views;
}

export function edgePickPoints(target: Edge, edges: Edge[]): number[][] {
  const samples: number[][] = [];
  for (let i = SAMPLE_FROM; i < SAMPLE_TO; i++) samples.push(lerp(target.a, target.b, i / SAMPLE_STEPS));
  const rivals = edges.filter((edge) => edge.id !== target.id).flatMap((edge) => [edge.a, edge.b]);
  return [...samples, ...rivals];
}

export function clearestSpot(projected: ScreenPoint[], canvas: ScreenRect): EdgeSpot | null {
  const right = canvas.left + canvas.width;
  const bottom = canvas.top + canvas.height;
  let best: EdgeSpot | null = null;

  for (let i = 0; i < EDGE_SAMPLE_COUNT; i++) {
    const sample = projected[i];
    if (sample.x < canvas.left + CANVAS_MARGIN_PX || sample.x > right - CANVAS_MARGIN_PX) continue;
    if (sample.y < canvas.top + CANVAS_MARGIN_PX || sample.y > bottom - CANVAS_MARGIN_PX) continue;

    let clearance = Infinity;
    for (let rival = EDGE_SAMPLE_COUNT; rival + 1 < projected.length; rival += 2) {
      clearance = Math.min(clearance, distToSegment(sample, projected[rival], projected[rival + 1]));
    }
    if (!best || clearance > best.clearance) {
      best = { clearance, scr: [Math.round(sample.x), Math.round(sample.y)] };
    }
  }
  return best;
}

export function offsetFromEdge(base: EdgeSpot, a: ScreenPoint, b: ScreenPoint, px: number): EdgeSpot {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = [-(b.y - a.y) / len, (b.x - a.x) / len];
  return {
    clearance: base.clearance,
    scr: [Math.round(base.scr[0] + normal[0] * px), Math.round(base.scr[1] + normal[1] * px)],
  };
}
