export interface SketchVisibilityInput {
  visible?: unknown;
  used: boolean;
}

export function isSketchVisible({ visible, used }: SketchVisibilityInput): boolean {
  if (visible === true) return true;
  if (visible === false) return false;
  return !used;
}

export function isSketchOutlineShown(input: SketchVisibilityInput & { inOperation: boolean }): boolean {
  return input.inOperation || isSketchVisible(input);
}
