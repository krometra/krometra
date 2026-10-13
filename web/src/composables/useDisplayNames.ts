// Отображаемые имена компонентов и фич.
// Пользовательские имена живут в document.metadata.names ({id: имя}) —
// сохранение эскизов/геометрии не трогает metadata, поэтому они устойчивы.

import { computed } from "vue";
import { useDocument } from "./shared/useDocument";
import { bodyNumbering } from "@/lib/bodyNumbering";
import type { TimelineEntry } from "@/types/api";

export function useDisplayNames() {
  const documentStore = useDocument();

  const names = computed<Record<string, string>>(() => {
    const raw = documentStore.document.value?.metadata?.names;
    return (raw && typeof raw === "object" ? raw : {}) as Record<string, string>;
  });

  const timeline = computed<TimelineEntry[]>(() => {
    const tl = documentStore.document.value?.timeline;
    return (Array.isArray(tl) ? tl : []) as TimelineEntry[];
  });

  const bodyIds = computed<string[]>(() => {
    const comps = documentStore.document.value?.components ?? {};
    return Object.entries(comps)
      .filter(([, v]) => v && typeof v === "object" && (v as Record<string, unknown>).type === "body")
      .map(([id]) => id);
  });

  // Номер тела — по порядку появления в истории, а не по позиции в текущем
  // списке: иначе поглощённое вырезом тело сдвигало нумерацию соседей и
  // исторические подписи («Целевое тело: Тело 2») показывали не то тело.
  const bodyNumbers = computed(() => bodyNumbering(timeline.value, bodyIds.value));

  function entryLabel(entry: TimelineEntry): string {
    return names.value[entry.id] ?? entry.label;
  }

  function sketchLabel(sketchId: string): string {
    const custom = names.value[sketchId];
    if (custom) return custom;
    const entry = timeline.value.find((e) => e.sketch_id === sketchId && e.kind === "sketch");
    return entry ? entryLabel(entry) : sketchId;
  }

  function bodyLabel(bodyId: string): string {
    const custom = names.value[bodyId];
    if (custom) return custom;
    const number = bodyNumbers.value.get(bodyId);
    return number ? `Тело ${number}` : bodyId.slice(0, 12);
  }

  async function rename(projectId: string, id: string, name: string) {
    const doc = documentStore.document.value;
    if (!doc) return;
    const updated = { ...names.value };
    const trimmed = name.trim();
    if (trimmed) updated[id] = trimmed;
    else delete updated[id];
    documentStore.document.value = {
      ...doc,
      metadata: { ...doc.metadata, names: updated },
    };
    documentStore.markDirty();
    await documentStore.save(projectId);
  }

  return { names, sketchLabel, bodyLabel, entryLabel, rename };
}
