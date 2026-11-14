import type { DomainMessages } from "../../message";

export const viewportText = {
  "viewportText.shaded": "Заливка",
  "viewportText.shadedEdges": "Заливка с рёбрами",
  "viewportText.wireframe": "Каркас",
  "viewportText.hiddenLine": "Видимые рёбра",
  "viewportText.selectBody": "Выбор тела",
  "viewportText.selectEdges": "Выбор рёбер",
  "viewportText.measure": "Измерение",
  "viewportText.selectPlaneReference": "Выбор опоры плоскости",
  "viewportText.isometric": "Изометрия",
  "viewportText.front": "СПЕРЕДИ",
  "viewportText.back": "СЗАДИ",
  "viewportText.top": "СВЕРХУ",
  "viewportText.bottom": "СНИЗУ",
  "viewportText.left": "СЛЕВА",
  "viewportText.right": "СПРАВА",
  "viewportText.edgeLine": "Отрезок {length} мм",
  "viewportText.edgeArc": "Дуга R{radius} · {length} мм",
  "viewportText.edgeCircle": "Окружность ⌀{diameter} мм",
  "viewportText.edgeCurve": "Кривая {length} мм",
  "viewportText.sampleDimension": "120,0 мм",
  "viewportText.edgeChain": {
    "one": "Цепочка: {count} ребро · {length} мм",
    "few": "Цепочка: {count} ребра · {length} мм",
    "many": "Цепочка: {count} рёбер · {length} мм",
    "other": "Цепочка: {count} ребра · {length} мм"
  }
} as const satisfies DomainMessages<"viewportText">;
