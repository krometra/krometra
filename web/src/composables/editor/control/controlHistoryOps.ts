import { HistoryConflictError } from "@/core/commands/RecordedCommand";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { fail } from "@/lib/control/protocol";
import { HistoryEditError } from "@/lib/bodyHistory";
import { isEmptyChange, type TimelineChange } from "@/lib/timelineChange";
import type { EditorControlContext } from "./controlContext";
import type { HistoryDirection } from "../useModelHistory";

const CHANGE_FORMAT =
  "{ label, removed: [запись], added: [запись], changed: [запись], components?: [id] } — запись в формате timeline из op state, components — id изменённых компонентов документа (тела, эскизы, рабочие плоскости)";

export function describeChange(context: EditorControlContext, label: string, change: TimelineChange, components?: string[]) {
  return {
    label,
    removed: change.removed.map(context.timelineEntry),
    added: change.added.map(context.timelineEntry),
    changed: change.changed.map(context.timelineEntry),
    ...(components ? { components } : {}),
  };
}

export function asOperationFailure(error: unknown): never {
  if (error instanceof HistoryConflictError || error instanceof HistoryEditError) throw fail("operation_failed", error.message);
  throw error;
}

export function historyOps(context: EditorControlContext): ControlOp[] {
  function availability() {
    const source = context.sketch.sketchMode.value ? context.sketch : context.history;
    return { canUndo: source.canUndo.value, canRedo: source.canRedo.value, mode: context.mode() };
  }

  async function stepSketch(direction: HistoryDirection) {
    const stepped = direction === "undo" ? await context.sketch.undo() : await context.sketch.redo();
    if (!stepped) throw fail("operation_failed", direction === "undo" ? "Отменять в эскизе нечего." : "Повторять в эскизе нечего.");
    return { scope: "sketch", ...availability() };
  }

  async function stepModel(direction: HistoryDirection) {
    const step = await context.history.step(direction).catch(asOperationFailure);
    if (!step) throw fail("operation_failed", direction === "undo" ? "Отменять нечего." : "Повторять нечего.");
    if (isEmptyChange(step.change) && step.components.length === 0) {
      throw fail("operation_failed", `«${step.label}»: история модели не изменилась. Проверьте op state.`);
    }
    const key = direction === "undo" ? "undone" : "redone";
    return { scope: "model", [key]: describeChange(context, step.label, step.change, step.components), ...availability() };
  }

  function stepHistory(direction: HistoryDirection) {
    return context.sketch.sketchMode.value ? stepSketch(direction) : stepModel(direction);
  }

  return [
    defineOp({
      op: "history.undo",
      description: `Отмена — то же, что Ctrl+Z: в режиме эскиза откатывает последнюю правку эскиза, иначе последнюю операцию модели (включая создание, правку и удаление эскиза, удаление тела или записи, подавление и откат по timeline). Тела, скрытые операцией, снова становятся видимыми; повтор вернёт те же id. Возвращает { scope: sketch | model, undone?, canUndo, canRedo, mode }, undone — ${CHANGE_FORMAT}. Если отменять нечего или после операции изменено то, что она создала, — operation_failed, модель не меняется.`,
      mutates: true,
      run: () => stepHistory("undo"),
    }),

    defineOp({
      op: "history.redo",
      description: `Повтор — то же, что Ctrl+Y: возвращает отменённую правку эскиза или операцию модели с прежними id тел и записей. Возвращает { scope: sketch | model, redone?, canUndo, canRedo, mode }, redone — ${CHANGE_FORMAT}. Если повторять нечего — operation_failed.`,
      mutates: true,
      run: () => stepHistory("redo"),
    }),
  ];
}
