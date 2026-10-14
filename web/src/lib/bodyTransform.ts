export type Vec3 = [number, number, number];

export interface BodyRotation {
  axis: Vec3;
  angle: number;
  origin: Vec3;
}

export interface BodyTransform {
  translate: Vec3;
  rotate: BodyRotation | null;
}

export function isIdentityTransform(transform: BodyTransform): boolean {
  const moved = transform.translate.some((value) => Math.abs(value) > 1e-9);
  const turned = transform.rotate !== null && Math.abs(transform.rotate.angle % 360) > 1e-9;
  return !moved && !turned;
}

export function transformLabel(transform: BodyTransform, copy: boolean): string {
  const parts: string[] = [];
  if (transform.translate.some((value) => Math.abs(value) > 1e-9)) parts.push(`сдвиг [${transform.translate.map((value) => Number(value.toFixed(3))).join(", ")}] мм`);
  if (transform.rotate && Math.abs(transform.rotate.angle) > 1e-9) parts.push(`поворот ${Number(transform.rotate.angle.toFixed(3))}°`);
  return `${copy ? "Копия" : "Перемещение"}: ${parts.join(", ")}`;
}

function vectorText(value: unknown): string {
  return Array.isArray(value) ? `[${value.map((item) => Number(Number(item).toFixed(3))).join(", ")}]` : "—";
}

export function transformParams(params: Record<string, unknown>): { label: string; value: string }[] {
  const rotate = params.rotate as BodyRotation | null | undefined;
  return [
    { label: "Тип", value: params.copy === true ? "Копия" : "Перемещение" },
    { label: "Сдвиг", value: `${vectorText(params.translate)} мм` },
    { label: "Поворот", value: rotate ? `${rotate.angle}° вокруг ${vectorText(rotate.axis)} через ${vectorText(rotate.origin)}` : "—" },
  ];
}
