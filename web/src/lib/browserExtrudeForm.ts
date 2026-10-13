import type { BrowserExtrudeOptions } from "@/composables/editor/useBrowserGeometry";

export function browserExtrudeForm(options: BrowserExtrudeOptions): Record<string, string> {
  const fields: Record<string, string> = {
    distance: String(options.distance),
    direction: options.direction,
    operation: options.operation,
    extent_type: options.extentType,
  };
  if (options.direction === "two_sided") fields.back_distance = String(options.backDistance);
  if (options.extentType === "up_to_face" || options.extentType === "up_to_body") fields.offset = String(options.offset);
  if (options.targetBodyId) fields.target_body_id = options.targetBodyId;
  if (options.upToBodyId) fields.up_to_body_id = options.upToBodyId;
  if (options.upToFaceId !== null) fields.up_to_face_id = String(options.upToFaceId);
  return fields;
}

export function browserExtrudeLabel(options: BrowserExtrudeOptions): string {
  if (options.extentType === "through_all") return "Выдавить насквозь в браузере";
  if (options.extentType === "up_to_face") return "Выдавить до грани в браузере";
  if (options.extentType === "up_to_body") return "Выдавить до тела в браузере";
  return `Выдавить ${Math.abs(options.distance)}мм в браузере`;
}
