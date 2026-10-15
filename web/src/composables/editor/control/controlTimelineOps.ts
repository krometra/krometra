import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import type { TimelineEdit } from "@/core/commands/TimelineEditCommand";
import { deleteRolledBack, deleteTimelineEntry, rollTimelineTo, setEntrySuppressed } from "@/lib/timelineEdits";
import { isFailed, rollbackIndex } from "@/lib/timelineFlags";
import type { TimelineEntry } from "@/types/api";
import type { EditorControlContext } from "./controlContext";
import { asOperationFailure, describeChange } from "./controlHistoryOps";

const CHANGE_FORMAT = "{ label, removed, added, changed } — записи в формате timeline из op state";
const RESULT = `Возвращает { change: ${CHANGE_FORMAT}, failed: [запись], marker, mode }: failed — записи, которые после пересборки не построились (status error, причина в error), marker — сколько записей истории входит в модель. Отменяется одним history.undo.`;

export function timelineOps(context: EditorControlContext): ControlOp[] {
  function entryOf(featureId: string): TimelineEntry {
    const entry = context.model.timelineEntries.value.find((candidate) => candidate.id === featureId);
    if (!entry) throw fail("not_found", `Записи «${featureId}» нет в истории. Список — timeline в op state.`);
    return entry;
  }

  async function apply(label: string, edit: TimelineEdit) {
    context.leaveTools();
    const change = await context.history.editTimeline(label, edit).catch(asOperationFailure);
    const entries = context.model.timelineEntries.value;
    return {
      change: describeChange(context, label, change),
      failed: entries.filter(isFailed).map(context.timelineEntry),
      marker: rollbackIndex(entries),
      mode: context.mode(),
    };
  }

  return [
    defineOp({
      op: "timeline.delete",
      description: `Удаляет запись истории — то же, что «Удалить» в контекстном меню и клавиша Delete. Операции, построенные на результате удалённой, пересобираются от её исходного тела (вырез после удалённого скругления режет тело без скругления); если без удалённой операция не строится (грань или тело пропали, эскиз удалён), она остаётся в истории с ошибкой, остальная модель достраивается. Удалённый эскиз оставляет зависимые операции с ошибкой «эскиз не найден». ${RESULT}`,
      mutates: true,
      params: { featureId: param.id("id записи из timeline в op state.") },
      run: ({ featureId }) => apply(`Удалить ${context.names.entryLabel(entryOf(featureId))}`, (document) => deleteTimelineEntry(document, featureId)),
    }),

    defineOp({
      op: "timeline.suppress",
      description: `Подавляет операцию или снимает подавление: запись остаётся в истории (suppressed: true), модель и зависимые операции пересобираются так, будто её нет. Эскиз подавить нельзя. ${RESULT}`,
      mutates: true,
      params: {
        featureId: param.id("id операции из timeline в op state."),
        suppressed: param.boolean("true — подавить, false — вернуть операцию в модель."),
      },
      run: ({ featureId, suppressed }) => {
        const label = `${suppressed ? "Подавить" : "Вернуть"} ${context.names.entryLabel(entryOf(featureId))}`;
        return apply(label, (document) => setEntrySuppressed(document, featureId, suppressed));
      },
    }),

    defineOp({
      op: "timeline.rollback",
      description: `Переносит маркер отката: модель показывается на состоянии после записи afterFeatureId, более поздние записи остаются в истории серыми (rolledBack: true) и в модель не входят. Новые операции вставляются в точку маркера, более поздние перестраиваются поверх них. Без afterFeatureId маркер возвращается в конец — полная модель. ${RESULT}`,
      mutates: true,
      params: { afterFeatureId: param.optional(param.id("id записи, после которой встаёт маркер. Не задан — маркер в конец истории.")) },
      run: ({ afterFeatureId }) => {
        const entries = context.model.timelineEntries.value;
        const index = afterFeatureId === undefined ? entries.length : entries.indexOf(entryOf(afterFeatureId)) + 1;
        const label = index >= entries.length ? "Вернуть маркер в конец" : "Откатить историю";
        return apply(label, (document) => rollTimelineTo(document, index));
      },
    }),

    defineOp({
      op: "timeline.deleteAfterMarker",
      description: `Удаляет все записи после маркера отката вместе с их телами и эскизами. Если маркер в конце — operation_failed. ${RESULT}`,
      mutates: true,
      run: () => apply("Удалить всё после маркера", (document) => deleteRolledBack(document, context.names.entryLabel)),
    }),
  ];
}
