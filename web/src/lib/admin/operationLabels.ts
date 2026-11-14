import type { TimelineEntry } from "@/types/api";
import { translateAdminRu, type AdminKey, type AdminTranslator } from "./i18n";

const OPERATION_KEYS: Record<TimelineEntry["kind"], AdminKey> = {
  sketch: "admin.op.sketch", extrude: "admin.op.extrude", revolve: "admin.op.revolve", sweep: "admin.op.sweep",
  loft: "admin.op.loft", fillet: "admin.op.fillet", chamfer: "admin.op.chamfer", thread: "admin.op.thread",
  hole: "admin.op.hole", shell: "admin.op.shell", draft: "admin.op.draft", press_pull: "admin.op.press_pull",
  pattern: "admin.op.pattern", mirror: "admin.op.mirror", boolean: "admin.op.boolean", import: "admin.op.import",
  transform: "admin.op.transform",
};

type OperationKey = `admin.op.${TimelineEntry["kind"]}`;

export function operationLabel(kind: string, t: AdminTranslator = translateAdminRu): string {
  const key = (OPERATION_KEYS as Record<string, OperationKey | undefined>)[kind];
  return key ? t(key) : kind;
}
