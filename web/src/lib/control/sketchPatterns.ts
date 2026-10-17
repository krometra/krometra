import type { SketchPoint } from "@/types/api";
import type { SketchEntityInput } from "./sketchEntities";

export interface LinearPattern {
  count: number;
  step: SketchPoint;
  count2?: number;
  step2?: SketchPoint;
}

export interface CircularPattern {
  count: number;
  center: SketchPoint;
  angle?: number;
}

type Transform = (point: SketchPoint) => SketchPoint;

function copyId(input: SketchEntityInput, index: number): { id?: string } {
  if (input.id === undefined) return {};
  return { id: index === 0 ? input.id : `${input.id}-${index}` };
}

function rectangleLines(input: Extract<SketchEntityInput, { type: "rectangle" }>, move: Transform): SketchEntityInput[] {
  const { corner1, corner2 } = input;
  const corners = [corner1, { x: corner2.x, y: corner1.y }, corner2, { x: corner1.x, y: corner2.y }].map(move);
  const flags = input.construction === undefined ? {} : { construction: input.construction };
  return corners.map((start, index) => ({ type: "line", start, end: corners[(index + 1) % 4], ...flags }));
}

function transformed(input: SketchEntityInput, move: Transform, rotation: number): SketchEntityInput[] {
  if (input.type === "line") return [{ ...input, start: move(input.start), end: move(input.end) }];
  if (input.type === "circle") return [{ ...input, center: move(input.center) }];
  if (input.type === "arc") {
    return [{ ...input, center: move(input.center), startAngle: input.startAngle + rotation, endAngle: input.endAngle + rotation }];
  }
  if (Math.abs(Math.sin(rotation * 2)) < 1e-12) {
    return [{ ...input, corner1: move(input.corner1), corner2: move(input.corner2) }];
  }
  return rectangleLines(input, move);
}

function copies(inputs: SketchEntityInput[], index: number, move: Transform, rotation: number): SketchEntityInput[] {
  return inputs.flatMap((input) => {
    const [first, ...rest] = transformed(input, move, rotation);
    const id = copyId(input, index);
    return rest.length === 0 ? [{ ...first, ...id }] : [first, ...rest];
  });
}

export function linearPattern(inputs: SketchEntityInput[], pattern: LinearPattern): SketchEntityInput[] {
  const rows = pattern.count2 ?? 1;
  const second = pattern.step2 ?? { x: 0, y: 0 };
  const result: SketchEntityInput[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < pattern.count; column++) {
      const dx = pattern.step.x * column + second.x * row;
      const dy = pattern.step.y * column + second.y * row;
      result.push(...copies(inputs, row * pattern.count + column, (p) => ({ x: p.x + dx, y: p.y + dy }), 0));
    }
  }
  return result;
}

export function circularPattern(inputs: SketchEntityInput[], pattern: CircularPattern): SketchEntityInput[] {
  const total = pattern.angle ?? Math.PI * 2;
  const full = Math.abs(Math.abs(total) - Math.PI * 2) < 1e-9;
  const step = pattern.count > 1 ? total / (full ? pattern.count : pattern.count - 1) : 0;
  const { center } = pattern;
  const result: SketchEntityInput[] = [];
  for (let index = 0; index < pattern.count; index++) {
    const angle = step * index;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotate: Transform = (p) => ({
      x: center.x + (p.x - center.x) * cos - (p.y - center.y) * sin,
      y: center.y + (p.x - center.x) * sin + (p.y - center.y) * cos,
    });
    result.push(...copies(inputs, index, rotate, angle));
  }
  return result;
}
