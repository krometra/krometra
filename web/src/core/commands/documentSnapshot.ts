// Общий откат документа для команд истории (extrude/revolve/fillet/chamfer).
//
// Раньше этот код был скопирован в четырёх командах побайтово. Помимо
// дублирования в нём был баг потери данных: снимок components/timeline,
// снятый в конструкторе команды, записывался поверх ТЕКУЩЕГО документа с его
// свежей версией. Если после операции документ менялся ещё чем-то (сохранение
// эскиза, автосейв, другая операция), эти изменения молча стирались, и после
// перезагрузки страницы модель «откатывалась» к раннему состоянию.

import { useApi } from "@/composables/useApi";
import { toast } from "@/composables/useToast";
import type { Document } from "@/types/api";

export interface DocumentSnapshot {
  components: Record<string, unknown>;
  timeline: unknown[];
  /** Версия документа на момент снятия снимка. */
  version: number;
}

/** Снять снимок документа для последующего отката. */
export function captureSnapshot(doc: Document | null): DocumentSnapshot | null {
  if (!doc) return null;
  return {
    components: JSON.parse(JSON.stringify(doc.components ?? {})),
    timeline: [...(doc.timeline ?? [])],
    version: doc.version,
  };
}

/**
 * Восстановить документ из снимка.
 *
 * Откат разрешён, только если документ не ушёл вперёд относительно снимка:
 * иначе мы бы затёрли чужие изменения. Возвращает false, если откат отклонён.
 */
export async function restoreSnapshot(
  projectId: string,
  snapshot: DocumentSnapshot,
  expectedVersionAfterOperation?: number,
): Promise<boolean> {
  const api = useApi();
  const current = await api.get<Document>(`/projects/${projectId}/document`);
  if (!current) return false;

  // Операция, которую отменяем, сама подняла версию на 1. Всё, что больше, —
  // чужие изменения, поверх которых откатывать нельзя.
  const limit = expectedVersionAfterOperation ?? snapshot.version + 1;
  if (current.version > limit) {
    toast(
      "Документ изменился после этой операции — отмена отменена, чтобы не потерять правки",
      "warning",
    );
    return false;
  }

  await api.put<Document>(`/projects/${projectId}/document`, {
    components: snapshot.components,
    timeline: snapshot.timeline,
    metadata: current.metadata,
    version: current.version,
  });
  return true;
}
