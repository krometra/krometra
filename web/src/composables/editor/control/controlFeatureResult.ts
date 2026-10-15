import { SAVE_FAILED_MESSAGE } from "@/lib/apiError";
import { fail } from "@/lib/control/protocol";
import type { EditorControlContext } from "./controlContext";

export const FEATURE_RESULT =
  "Возвращает { feature: { id, kind, label, name, status, params, sketchId, bodyId }, mode }: feature — новая запись истории, feature.bodyId — тело-результат. После операции редактор в режиме model. Отказ ядра приходит ошибкой operation_failed с его объяснением, модель при этом не меняется. save_failed — геометрия построена, но сервер не сохранил её даже после повторов (нет связи, 502–504): модель не изменилась, повторите операцию через 10–20 с, сначала сверив op state.";

export async function applyControlFeature(
  context: EditorControlContext,
  run: () => Promise<void>,
  readError: () => string | null,
  leave: () => void,
) {
  const known = new Set(context.model.timelineEntries.value.map((entry) => entry.id));
  await run();
  const error = readError();
  leave();
  if (error) throw fail(error === SAVE_FAILED_MESSAGE ? "save_failed" : "operation_failed", error);
  const created = [...context.model.timelineEntries.value].reverse().find((entry) => !known.has(entry.id));
  if (!created) throw fail("operation_failed", "Операция не добавила запись в историю модели.");
  return { feature: context.timelineEntry(created), mode: context.mode() };
}

export function requireVisibleBody(context: EditorControlContext, bodyId: string) {
  context.bodyMesh(bodyId);
  const body = context.model.bodies.value.find((candidate) => candidate.id === bodyId);
  if (body?.visible === false) throw fail("operation_failed", `Тело «${bodyId}» скрыто: операция доступна только для видимого тела.`);
}
