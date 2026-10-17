import { bodyConsumers, deleteBody } from "@/lib/bodyHistory";
import { useSketchVisibility } from "../useSketchVisibility";
import { isIdentityTransform } from "@/lib/bodyTransform";
import { outputBodyOf } from "@/lib/browserRebuildPlan";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { INVALID, param } from "@/lib/control/params";
import type { BodyRotation, BodyTransform, Vec3 } from "@/lib/bodyTransform";
import { fail } from "@/lib/control/protocol";
import { isOpenSketch } from "@/lib/timelineGuards";
import type { EditorControlContext } from "./controlContext";
import { asOperationFailure, describeChange } from "./controlHistoryOps";

function vector(value: unknown): Vec3 | null {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1], value[2]]
    : null;
}

function readRotation(raw: Record<string, unknown>): BodyRotation | typeof INVALID {
  const axis = vector(raw.axis);
  const origin = raw.origin === undefined ? [0, 0, 0] as Vec3 : vector(raw.origin);
  const angle = raw.angle;
  if (!axis || !origin || Math.hypot(...axis) < 1e-9 || typeof angle !== "number" || !Number.isFinite(angle)) return INVALID;
  return { axis, angle, origin };
}

const CHANGE_FORMAT = "{ label, removed: [запись], added: [], changed: [] } — запись в формате timeline из op state";

export function bodyLineage(context: EditorControlContext) {
  const consumers = bodyConsumers({ components: context.documentStore.document.value?.components ?? {}, timeline: context.model.timelineEntries.value });
  return (bodyId: string) => {
    const consumer = consumers.get(bodyId);
    return { consumedBy: consumer?.id ?? null, replacedBy: consumer ? outputBodyOf(consumer) : null };
  };
}

export function bodyOps(context: EditorControlContext): ControlOp[] {
  const sketchVisibility = useSketchVisibility();

  function requireBody(bodyId: string) {
    if (!context.model.bodies.value.some((body) => body.id === bodyId)) {
      throw fail("not_found", `Тела «${bodyId}» нет в документе. Список тел — op "state".`);
    }
  }

  function bodySummary(bodyId: string) {
    const body = context.model.bodies.value.find((candidate) => candidate.id === bodyId);
    return {
      id: bodyId,
      name: context.names.bodyLabel(bodyId),
      visible: body?.visible !== false,
      color: typeof body?.color === "string" ? body.color : null,
    };
  }

  function closeSketchForDelete(sketchId: string) {
    if (!isOpenSketch(context.lockState(), sketchId)) return;
    if (context.model.sketchHasFeature(sketchId)) {
      throw fail("operation_failed", "Этот эскиз открыт, и по нему построены операции: удалите его запись через timeline.delete (зависимые останутся с ошибкой) или закройте эскиз.");
    }
    context.sketchFlow.handleSketchCancel();
  }

  return [
    defineOp({
      op: "body.delete",
      description: `Удаляет тело вместе с его историей: операцию, которая его построила, все промежуточные тела цепочки join/cut/скруглений, из которых оно выросло, и эскизы, которые больше ни во что не идут. Удалять можно только «живое» тело (consumedBy = null в op state). Если на удаляемое опираются другие операции (до тела, эскиз на грани) — operation_failed с их списком. Отменяется history.undo. Возвращает { deleted: ${CHANGE_FORMAT}, mode }.`,
      mutates: true,
      params: { bodyId: param.id("Тело из op state.") },
      run: async ({ bodyId }) => {
        requireBody(bodyId);
        context.leaveTools();
        const label = `Удалить ${context.names.bodyLabel(bodyId)}`;
        const change = await context.history
          .edit(label, (document) => deleteBody(document, bodyId, context.names.entryLabel))
          .catch(asOperationFailure);
        return { deleted: describeChange(context, label, change), mode: context.mode() };
      },
    }),

    defineOp({
      op: "body.setVisible",
      description:
        "Показывает или скрывает тело — как глаз в дереве модели. Скрытое тело не попадает в снимок и в экспорт по умолчанию, история не меняется. Возвращает { body: { id, name, visible, color } }.",
      mutates: true,
      params: {
        bodyId: param.id("Тело из op state."),
        visible: param.boolean("true — показать, false — скрыть."),
      },
      run: async ({ bodyId, visible }) => {
        requireBody(bodyId);
        await context.bodyPresentation.setVisible(bodyId, visible);
        return { body: bodySummary(bodyId) };
      },
    }),

    defineOp({
      op: "body.rename",
      description:
        "Задаёт телу имя — как «Переименовать» в дереве модели. Имя видно в op state, в дереве и в имени файла экспорта с bodyIds. Возвращает { body: { id, name, visible, color } }.",
      mutates: true,
      params: {
        bodyId: param.id("Тело из op state."),
        name: param.string("Новое имя, например «Плата» или «Камера»."),
      },
      run: async ({ bodyId, name }) => {
        requireBody(bodyId);
        context.requireHistoryUnlocked();
        if (!name.trim()) throw fail("invalid_params", "Имя не может состоять из одних пробелов.");
        await context.names.rename(context.projectId, bodyId, name);
        return { body: bodySummary(bodyId) };
      },
    }),

    defineOp({
      op: "body.setColor",
      description:
        "Красит тело во вьюпорте и на снимках, чтобы компоненты не сливались. Цвет хранится в документе; без color возвращается цвет по умолчанию. Геометрию и экспорт не меняет. Возвращает { body: { id, name, visible, color } }.",
      mutates: true,
      params: {
        bodyId: param.id("Тело из op state."),
        color: param.optional(param.color("Цвет #rrggbb, например #2e7d32. Не задан — цвет по умолчанию.")),
      },
      run: async ({ bodyId, color }) => {
        requireBody(bodyId);
        await context.bodyPresentation.setColor(bodyId, color ?? null);
        return { body: bodySummary(bodyId) };
      },
    }),

    defineOp({
      op: "body.transform",
      description:
        "Перемещает тело: сдвиг translate и/или поворот rotate (сначала поворот, затем сдвиг). Это операция истории — в timeline появляется запись kind = transform, тело-результат получает новый id, а исходное поглощается и скрывается (как у join). С copy = true исходное тело остаётся видимым, результат — его копия: так размножают одинаковые компоненты. Id граней и рёбер переносятся на результат без изменений. Отменяется history.undo. Возвращает { bodyId, feature, mode }: bodyId — тело-результат.",
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        translate: param.optional(param.vec3("Сдвиг [dx, dy, dz] в мм. По умолчанию [0, 0, 0].")),
        rotate: param.optional(
          param.object(
            "Поворот { axis: [x, y, z], angle, origin?: [x, y, z] }: ось (длина не важна), угол в градусах против часовой стрелки, если смотреть навстречу оси, точка на оси (по умолчанию начало координат).",
            "{ axis: [x, y, z], angle: число, origin?: [x, y, z] }",
            readRotation,
          ),
        ),
        copy: param.optional(param.boolean("true — оставить исходное тело и создать перемещённую копию. По умолчанию false.")),
      },
      run: async ({ bodyId, translate, rotate, copy }) => {
        requireBody(bodyId);
        if (bodyLineage(context)(bodyId).consumedBy !== null) {
          throw fail("operation_failed", `Тело «${bodyId}» уже поглощено операцией: перемещайте его результат (replacedBy в op state).`);
        }
        const transform: BodyTransform = { translate: translate ?? [0, 0, 0], rotate: rotate ?? null };
        if (!copy && isIdentityTransform(transform)) {
          throw fail("invalid_params", "Задайте translate или rotate: перемещение без сдвига и поворота ничего не меняет.");
        }
        context.leaveTools();
        const known = new Set(context.model.timelineEntries.value.map((entry) => entry.id));
        const resultId = await context.bodyTransform.apply(bodyId, transform, copy === true);
        const feature = context.model.timelineEntries.value.find((entry) => !known.has(entry.id));
        return { bodyId: resultId, feature: feature ? context.timelineEntry(feature) : null, mode: context.mode() };
      },
    }),

    defineOp({
      op: "sketch.setVisible",
      description:
        "Показывает или скрывает контур эскиза во вьюпорте - как глаз в дереве модели. Эскиз, по которому построена операция (used = true), скрыт по умолчанию; явный выбор сохраняется в документе и сильнее автоматики. История не меняется. Возвращает { sketch: { id, used, visible } }.",
      mutates: true,
      params: {
        sketchId: param.id("Эскиз из op state."),
        visible: param.boolean("true - показать, false - скрыть."),
      },
      run: async ({ sketchId, visible }) => {
        context.requireSketch(sketchId);
        await context.bodyPresentation.setSketchVisible(sketchId, visible);
        const sketch = context.model.sketches.value.find((candidate) => candidate.id === sketchId);
        return { sketch: { id: sketchId, used: context.model.sketchHasFeature(sketchId), visible: sketch ? sketchVisibility.isVisible(sketch) : visible } };
      },
    }),

    defineOp({
      op: "sketch.delete",
      description: `Удаляет эскиз и его запись истории. Открытый сейчас эскиз закрывается без сохранения и удаляется (как «Удалить» в его меню); при другом открытом эскизе - wrong_mode. Эскиз, по которому построена операция (used = true в op state), удалить нельзя — operation_failed; удалите сначала операцию (timeline.delete) или тело (body.delete). Отменяется history.undo. Возвращает { deleted: ${CHANGE_FORMAT}, mode }.`,
      mutates: true,
      params: { sketchId: param.id("Эскиз из op state.") },
      run: async ({ sketchId }) => {
        context.requireSketch(sketchId);
        closeSketchForDelete(sketchId);
        context.leaveTools();
        const label = `Удалить ${context.names.sketchLabel(sketchId)}`;
        const change = await context.sketchFlow.removeSketch(sketchId).catch(asOperationFailure);
        return { deleted: describeChange(context, label, change), mode: context.mode() };
      },
    }),
  ];
}
