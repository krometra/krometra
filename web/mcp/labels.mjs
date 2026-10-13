import { ToolError } from "./errors.mjs";

export const MAX_LABELS = 120;

const EDGE_END_KEYS = [
  ["start", "end"],
  ["a", "b"],
];
const FACE_POINT_KEYS = ["point", "centroid"];
const DIRECTIONS = [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
];
const RINGS = [1, 2.5, 4, 6];
const PIXEL_TOLERANCE = 0.5;
const EXCERPT = 300;

const isPoint = (value, size) =>
  Array.isArray(value) && value.length >= size && value.slice(0, size).every(Number.isFinite);
const roundMm = (value) => Math.round(value * 1000) / 1000;
const midpoint = (a, b) => a.map((value, axis) => (value + b[axis]) / 2);

function firstPoint(source, keys) {
  const key = keys.find((name) => isPoint(source[name], 3));
  return key ? source[key].slice(0, 3) : null;
}

function edgeEnds(edge) {
  const keys = EDGE_END_KEYS.find((pair) => pair.every((key) => isPoint(edge[key], 3)));
  return keys ? Object.fromEntries(keys.map((key) => [key, edge[key].slice(0, 3).map(roundMm)])) : null;
}

function edgeAnchor(edge) {
  const ends = edgeEnds(edge);
  const point = firstPoint(edge, ["midpoint"]) ?? (ends && midpoint(...Object.values(ends)));
  return point && { id: edge.id, point, details: ends ?? {} };
}

function boxCenter(box) {
  return isPoint(box?.min, 3) && isPoint(box?.max, 3) ? midpoint(box.min.slice(0, 3), box.max.slice(0, 3)) : null;
}

function faceAnchor(face) {
  const point = firstPoint(face, FACE_POINT_KEYS) ?? boxCenter(face.bbox);
  const normal = isPoint(face.normal, 3) ? { normal: face.normal.map(roundMm) } : {};
  return point && { id: face.id, point, details: { point: point.map(roundMm), ...normal } };
}

const ANCHOR_BY_KIND = { edges: edgeAnchor, faces: faceAnchor };

export function collectAnchors(topology, kind) {
  const entries = topology?.[kind];
  if (!Array.isArray(entries)) {
    throw new ToolError(
      `topology не вернул список ${kind}; ключи ответа: ${Object.keys(topology ?? {}).join(", ") || "нет"}.`,
    );
  }
  const resolved = entries.map((entry) => (entry && typeof entry === "object" ? ANCHOR_BY_KIND[kind](entry) : null));
  const anchors = resolved.filter(Boolean);
  if (entries.length && !anchors.length) {
    throw new ToolError(
      `У элементов ${kind} в topology нет точки привязки для подписи ` +
        "(ребру нужны midpoint или концы start и end, грани - point, centroid или bbox); " +
        `пример элемента: ${JSON.stringify(entries[0]).slice(0, EXCERPT)}`,
    );
  }
  return { anchors, unplaced: entries.filter((_, index) => !resolved[index]).map((entry) => entry?.id) };
}

function screenPoint(entry) {
  const usable = entry && !entry.behind && Number.isFinite(entry.x) && Number.isFinite(entry.y);
  return usable ? { x: entry.x, y: entry.y } : null;
}

function canvasRect(result) {
  const { left, top, width, height } = result?.canvas ?? {};
  const rect = { left, top, width, height };
  return Object.values(rect).every(Number.isFinite) && width > 0 && height > 0 ? rect : null;
}

export function normalizeProjection(result, expectedCount) {
  const rect = canvasRect(result);
  if (!rect || !Array.isArray(result.points) || result.points.length !== expectedCount) {
    throw new ToolError(
      "viewport.project ответил не в ожидаемой форме { points: [{ x, y, behind }], canvas: { left, top, width, height } }: " +
        JSON.stringify(result)?.slice(0, EXCERPT),
    );
  }
  return { rect, points: result.points.map(screenPoint) };
}

const close = (a, b) => Math.abs(a - b) <= PIXEL_TOLERANCE;

function samePoint(a, b) {
  if (!a || !b) return a === b;
  return close(a.x, b.x) && close(a.y, b.y);
}

export function sameProjection(first, second) {
  const sameRect = Object.keys(first.rect).every((key) => close(first.rect[key], second.rect[key]));
  return sameRect && first.points.every((point, index) => samePoint(point, second.points[index]));
}

export function toImagePoints({ rect, points }, image) {
  const scaleX = image.width / rect.width;
  const scaleY = image.height / rect.height;
  return points.map((point) => {
    if (!point) return null;
    const x = Math.round((point.x - rect.left) * scaleX);
    const y = Math.round((point.y - rect.top) * scaleY);
    return x >= 0 && y >= 0 && x < image.width && y < image.height ? { x, y } : null;
  });
}

export function labelMetrics(scale) {
  const fontSize = Math.round(12 * scale);
  return {
    fontSize,
    charWidth: fontSize * 0.62,
    padding: Math.round(3 * scale),
    gap: Math.round(8 * scale),
    dotRadius: Math.max(2, Math.round(2.5 * scale)),
  };
}

function boxAt(anchor, [dx, dy], distance, size) {
  const centerX = anchor.x + dx * (size.width / 2 + distance);
  const centerY = anchor.y + dy * (size.height / 2 + distance);
  return { x: Math.round(centerX - size.width / 2), y: Math.round(centerY - size.height / 2), ...size };
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const fits = (box, image) =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= image.width && box.y + box.height <= image.height;
const clamp = (value, max) => Math.max(0, Math.min(value, max));

function dotBox(anchor, radius) {
  return { x: anchor.x - radius, y: anchor.y - radius, width: radius * 2, height: radius * 2 };
}

function labelSize(text, metrics) {
  return {
    width: Math.ceil(text.length * metrics.charWidth) + metrics.padding * 2,
    height: metrics.fontSize + metrics.padding * 2,
  };
}

function pinnedInside(anchor, size, metrics, image) {
  const box = boxAt(anchor, DIRECTIONS[0], metrics.gap, size);
  return { ...box, x: clamp(box.x, image.width - size.width), y: clamp(box.y, image.height - size.height) };
}

export function layoutLabels(marks, image, metrics) {
  const obstacles = marks.map((mark) => dotBox(mark.anchor, metrics.dotRadius));
  return marks.map((mark) => {
    const size = labelSize(mark.text, metrics);
    const options = RINGS.flatMap((ring) =>
      DIRECTIONS.map((direction) => boxAt(mark.anchor, direction, metrics.gap * ring, size)),
    ).filter((box) => fits(box, image));
    const box =
      options.find((option) => obstacles.every((obstacle) => !overlaps(option, obstacle))) ??
      options[0] ??
      pinnedInside(mark.anchor, size, metrics, image);
    obstacles.push(box);
    return { ...mark, box };
  });
}

export function planLabels({ anchors, projection, image, labelText }) {
  const positions = toImagePoints(projection, image);
  const inFrame = anchors.map((anchor, index) => ({ ...anchor, at: positions[index] })).filter((anchor) => anchor.at);
  const shown = inFrame.slice(0, MAX_LABELS).map((anchor, index) => ({
    ...anchor,
    text: labelText === "number" ? String(index + 1) : String(anchor.id),
  }));
  const metrics = labelMetrics(image.width / projection.rect.width);
  const marks = layoutLabels(
    shown.map(({ text, at }) => ({ text, anchor: at })),
    image,
    metrics,
  );
  return {
    marks,
    metrics,
    shown,
    offscreen: anchors.length - inFrame.length,
    truncated: inFrame.length - shown.length,
  };
}

function legendItem({ id, text, details, at }) {
  return JSON.stringify({ ...(text !== String(id) && { label: text }), id, ...details, at: [at.x, at.y] });
}

export function formatLegend({ bodyId, kind, image, plan, unplaced, stable }) {
  const notes = [
    plan.truncated && `подписаны первые ${MAX_LABELS}, ещё ${plan.truncated} в кадре без подписи: приблизь камеру`,
    !stable && "камера двигалась во время съёмки, подписи могут быть смещены: повтори снимок",
  ].filter(Boolean);
  const header = {
    bodyId,
    kind,
    units: "mm",
    image,
    labeled: plan.shown.length,
    offscreen: plan.offscreen,
    ...(unplaced.length && { unplaced }),
    ...(notes.length && { notes }),
  };
  return `${JSON.stringify(header).slice(0, -1)},"items":[\n${plan.shown.map(legendItem).join(",\n")}\n]}`;
}
