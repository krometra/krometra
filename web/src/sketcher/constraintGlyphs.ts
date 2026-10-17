import type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import { anchorPoint, entityLookup, type EntityLookup } from "./dimensionAnchors";
import { unitNormal } from "./dimensionMeasure";
import { isSketchOrigin } from "./sketchOrigin";
import { WHOLE_ENTITY } from "./solver/fixConstraint";

export type GlyphShape = "badge" | "dot";

export interface ConstraintGlyph {
  constraintId: string;
  type: ConstraintType;
  text: string;
  shape: GlyphShape;
  at: SketchPoint;
}

const GLYPH_TEXT: Partial<Record<ConstraintType, string>> = {
  horizontal: "H",
  vertical: "V",
  parallel: "∥",
  perpendicular: "⊥",
  equal: "=",
  collinear: "⋯",
  midpoint: "△",
  point_on_curve: "∈",
  fix: "⊗",
  coincident: "",
};

const PER_ENTITY = new Set<ConstraintType>(["horizontal", "vertical", "parallel", "perpendicular", "equal", "collinear"]);
const AT_POINT = new Set<ConstraintType>(["coincident", "point_on_curve"]);

const LINE_OFFSET_PX = 14;
const POINT_OFFSET_PX = 11;
const STACK_STEP_PX = 18;
const BADGE_HALF_PX = 8;
const DOT_HALF_PX = 6;

export function hasGlyph(type: ConstraintType): boolean {
  return GLYPH_TEXT[type] !== undefined;
}

export function constraintEntityIds(constraint: SketchConstraint): string[] {
  return [...new Set(constraint.anchors.map((a) => a.entity_id).filter((id) => !isSketchOrigin(id)))];
}

const plus = (p: SketchPoint, d: SketchPoint, k: number): SketchPoint => ({ x: p.x + d.x * k, y: p.y + d.y * k });

function entitySpot(entity: SketchEntity | undefined, unit: number): SketchPoint | null {
  if (!entity) return null;
  switch (entity.type) {
    case "line": {
      const mid = { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 };
      const n = unitNormal(entity);
      return n ? plus(mid, n, LINE_OFFSET_PX * unit) : mid;
    }
    case "circle":
    case "arc": {
      const angle = entity.type === "arc" ? (entity.startAngle + entity.endAngle) / 2 : Math.PI / 4;
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      return plus(entity.center, dir, entity.radius + LINE_OFFSET_PX * unit);
    }
    case "rectangle":
      return { x: (entity.corner1.x + entity.corner2.x) / 2, y: (entity.corner1.y + entity.corner2.y) / 2 };
    default:
      return null;
  }
}

function pointSpot(lookup: EntityLookup, ref: ConstraintRef | undefined, unit: number): SketchPoint | null {
  const point = ref ? anchorPoint(lookup, ref) : null;
  const k = POINT_OFFSET_PX * unit * Math.SQRT1_2;
  return point ? { x: point.x + k, y: point.y + k } : null;
}

function spots(lookup: EntityLookup, c: SketchConstraint, unit: number): SketchPoint[] {
  if (PER_ENTITY.has(c.type)) {
    return c.anchors.flatMap((ref) => entitySpot(lookup(ref.entity_id), unit) ?? []);
  }
  if (AT_POINT.has(c.type)) return [pointSpot(lookup, c.anchors[0], unit) ?? []].flat();
  if (c.type === "midpoint") return [entitySpot(lookup(c.anchors[1]?.entity_id ?? ""), unit) ?? []].flat();
  if (c.type === "fix") {
    return c.anchors.flatMap((ref) =>
      (ref.sub_index === WHOLE_ENTITY ? entitySpot(lookup(ref.entity_id), unit) : pointSpot(lookup, ref, unit)) ?? [],
    );
  }
  return [];
}

function overlaps(a: SketchPoint, b: SketchPoint, unit: number): boolean {
  const gap = BADGE_HALF_PX * 2 * unit;
  return Math.abs(a.x - b.x) < gap && Math.abs(a.y - b.y) < gap;
}

function unstack(glyphs: ConstraintGlyph[], unit: number): ConstraintGlyph[] {
  const placed: ConstraintGlyph[] = [];
  for (const glyph of glyphs) {
    let at = glyph.at;
    while (placed.some((other) => overlaps(other.at, at, unit))) at = { x: at.x + STACK_STEP_PX * unit, y: at.y };
    placed.push({ ...glyph, at });
  }
  return placed;
}

export function constraintGlyphs(constraints: SketchConstraint[], entities: SketchEntity[], unit: number): ConstraintGlyph[] {
  const lookup = entityLookup(entities);
  const glyphs = constraints.flatMap((c) => {
    const text = GLYPH_TEXT[c.type];
    if (text === undefined) return [];
    const shape: GlyphShape = c.type === "coincident" ? "dot" : "badge";
    return spots(lookup, c, unit).map((at) => ({ constraintId: c.id, type: c.type, text, shape, at }));
  });
  return unstack(glyphs, unit);
}

export function glyphHalfSize(glyph: ConstraintGlyph, unit: number): number {
  return (glyph.shape === "dot" ? DOT_HALF_PX : BADGE_HALF_PX) * unit;
}

export function findConstraintGlyphAt(glyphs: ConstraintGlyph[], world: SketchPoint, unit: number): string | null {
  for (let i = glyphs.length - 1; i >= 0; i--) {
    const glyph = glyphs[i];
    const half = glyphHalfSize(glyph, unit);
    if (Math.abs(world.x - glyph.at.x) <= half && Math.abs(world.y - glyph.at.y) <= half) return glyph.constraintId;
  }
  return null;
}
