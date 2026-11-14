import type { MessageValues } from "@/lib/i18n/message";
import type { geometryErrors } from "@/lib/i18n/dictionaries/ru/geometryErrors";

export type GeometryErrorKey = keyof typeof geometryErrors;
export interface GeometryErrorDetails { key: GeometryErrorKey; values?: MessageValues }

const STATIC_ERRORS: Readonly<Record<string, GeometryErrorKey>> = {
  "Неизвестная операция браузерного ядра.": "geometryErrors.unsupported_operation",
  "Не удалось построить геометрию в браузере.": "geometryErrors.fallback",
  "Тело не загружено в браузерное ядро. Обновите документ и повторите.": "geometryErrors.body_not_loaded",
  "Выберите грань, до которой выдавливать.": "geometryErrors.face_required",
  "Выберите хотя бы одно ребро.": "geometryErrors.edge_required",
  "Радиус скругления должен быть больше нуля.": "geometryErrors.fillet_radius",
  "Размеры фаски должны быть больше нуля.": "geometryErrors.chamfer_size",
  "Не удалось построить фаску: уменьшите размер или выберите другие рёбра.": "geometryErrors.chamfer_failed",
  "Скругление не дало твёрдого тела.": "geometryErrors.fillet_not_solid",
  "Фаска не дала твёрдого тела.": "geometryErrors.chamfer_not_solid",
  "Браузерное ядро не смогло найти расстояние между объектами.": "geometryErrors.measure_failed",
  "Для измерения выберите один или два объекта.": "geometryErrors.measure_count",
  "Браузерное ядро не смогло построить сечение.": "geometryErrors.section_failed",
  "Цилиндрическая грань не найдена — выберите боковую поверхность стержня или стенку отверстия.": "geometryErrors.thread_face_not_found",
  "Не удалось построить винтовую поверхность резьбы. Проверьте шаг, глубину и длину.": "geometryErrors.thread_tool_failed",
  "Вычитание резьбы не удалось. Попробуйте другой шаг или глубину.": "geometryErrors.thread_cut_failed",
  "Резьба с такими параметрами ломает тело — уменьшите глубину, увеличьте шаг или сузьте вершину профиля.": "geometryErrors.thread_invalid",
  "Грань под отверстие не найдена — выберите плоскую грань заново.": "geometryErrors.hole_face_not_found",
  "Отверстие ставится только на плоскую грань.": "geometryErrors.hole_not_planar",
  "Не заданы центры отверстий: кликните по грани или выберите эскиз с окружностями.": "geometryErrors.hole_no_centers",
  "Отверстия с такими размерами ломают тело — измените диаметр, глубину или положение.": "geometryErrors.hole_invalid",
  "Ядро не смогло протянуть профиль по этому пути. Упростите путь или уменьшите профиль.": "geometryErrors.sweep_failed",
  "Тело протяжки пересекает само себя: радиус изгиба пути меньше размера профиля. Увеличьте радиус дуг пути или уменьшите профиль.": "geometryErrors.sweep_intersection",
  "Ядро не смогло построить лофт по этим профилям. Проверьте порядок профилей и что их плоскости не пересекаются внутри тела.": "geometryErrors.loft_failed",
  "Тело лофта пересекает само себя: измените порядок профилей или их положение.": "geometryErrors.loft_intersection",
  "Для лофта нужны минимум два профиля.": "geometryErrors.loft_profiles",
  "Браузерное ядро не смогло выполнить булеву операцию.": "geometryErrors.boolean_failed",
  "Выберите хотя бы одно тело-инструмент.": "geometryErrors.boolean_tools",
  "Второе направление массива параллельно первому — выберите другое.": "geometryErrors.pattern_parallel",
  "Зеркалить можно только относительно плоской грани.": "geometryErrors.mirror_plane",
  "Нейтральной плоскостью уклона может быть только плоская грань тела.": "geometryErrors.draft_plane",
  "Нечего экспортировать: нет видимых тел.": "geometryErrors.export_empty",
  "Ось массива задаёт только прямое ребро: выберите прямолинейное ребро или цилиндрическую грань.": "geometryErrors.pattern_axis_edge",
  "Ось массива задаёт цилиндрическая грань (её ось) или плоская грань (её нормаль) — выберите другую грань.": "geometryErrors.pattern_axis_face",
};

export function geometryErrorDetails(message: string): GeometryErrorDetails | null {
  const key = STATIC_ERRORS[message];
  if (key) return { key };
  const patterns: { pattern: RegExp; key: GeometryErrorKey; parameter: string }[] = [
    { pattern: /^Одной операцией можно сделать не больше (\d+) отверстий\.$/, key: "geometryErrors.too_many_holes", parameter: "count" },
    { pattern: /^Центр отверстия (\d+) лежит вне выбранной грани\.$/, key: "geometryErrors.center_off_face", parameter: "number" },
    { pattern: /^Отверстие (\d+) не вырезалось\. Измените размеры или положение\.$/, key: "geometryErrors.hole_cut_failed", parameter: "number" },
    { pattern: /^Отверстие (\d+) не задевает тело — проверьте положение центра\.$/, key: "geometryErrors.hole_misses_body", parameter: "number" },
  ];
  for (const { pattern, key, parameter } of patterns) {
    const match = message.match(pattern);
    if (match) return { key, values: { [parameter]: match[1] } };
  }
  return null;
}
