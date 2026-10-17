import type { TimelineEntry } from "@/types/api";
import { booleanToolsOf } from "./timelineFlags";

/**
 * Стабильные порядковые номера тел.
 *
 * Раньше номер был позицией в текущем `components`: стоило вырезу поглотить
 * тело и убрать его из документа, как все последующие сдвигались на единицу.
 * Историческая запись «Целевое тело: Тело 2» начинала показывать не то тело,
 * которое резали, — отсюда жалоба «подписи перепутаны местами».
 *
 * Считаем номер по ПЕРВОМУ появлению тела в timeline (порядок создания), а
 * тела, до которых timeline не дотянулся, дописываем в конец в порядке
 * документа. Номер, однажды выданный телу, больше не меняется.
 */
export function bodyNumbering(timeline: TimelineEntry[], bodyIds: string[]): Map<string, number> {
  const order: string[] = [];
  const seen = new Set<string>();

  const push = (id?: string | null) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    order.push(id);
  };

  for (const entry of timeline) {
    // Порядок внутри записи: сначала то, что операция взяла, потом что создала.
    push(entry.target_body_id);
    booleanToolsOf(entry).forEach(push);
    push(entry.body_id);
    push(entry.result_body_id);
  }
  for (const id of bodyIds) push(id);

  return new Map(order.map((id, i) => [id, i + 1]));
}
