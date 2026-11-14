import type { DomainMessages } from "../../message";

export const timeline = {
  "timeline.mm": "мм",
  "timeline.pieces": "шт.",
  "timeline.profiles": "проф.",
  "timeline.spacing": "шаг",
  "timeline.through": "насквозь",
  "timeline.onFace": "по грани",
  "timeline.merged": "объед.",
  "timeline.copy": "копия",
  "timeline.fromFace": "от грани",
  "timeline.fromPlane": "от",
  "timeline.faces": "граней:",
  "timeline.newBody": "новое тело",
  "timeline.faceShort": "гр.",
  "timeline.linear": "линейный",
  "timeline.smooth": "гладкий",
  "timeline.failed": "Ошибка: {error}",
  "timeline.suppressed": "Подавлена: модель построена без этой операции.",
  "timeline.rolledBack": "После маркера отката: не входит в модель."
} as const satisfies DomainMessages<"timeline">;
