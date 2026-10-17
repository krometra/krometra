import type { TimelineEntry } from "@/types/api";

export const OPERATION_LABELS: Record<TimelineEntry["kind"], string> = {
  sketch: "Эскиз",
  extrude: "Выдавливание",
  revolve: "Вращение",
  sweep: "Протяжка",
  loft: "Лофт",
  fillet: "Скругление",
  chamfer: "Фаска",
  thread: "Резьба",
  hole: "Отверстие",
  shell: "Оболочка",
  draft: "Уклон",
  press_pull: "Сдвиг грани",
  pattern: "Массив",
  mirror: "Зеркало",
  boolean: "Булева операция",
  import: "Импорт STEP",
  transform: "Перемещение",
};

export function operationLabel(kind: string): string {
  return (OPERATION_LABELS as Record<string, string>)[kind] ?? kind;
}
