import { computed, ref, type Ref } from "vue";
import type { useDocumentModel } from "./useDocumentModel";

export type OnboardingStep = "sketch" | "extrude" | "refine";

export interface OnboardingHint {
  step: OnboardingStep;
  title: string;
  body: string;
  cta: string;
  hotkey: string;
  variant: "center" | "pill";
}

const HINTS: Record<OnboardingStep, Omit<OnboardingHint, "step">> = {
  sketch: {
    title: "Начните с эскиза",
    body: "Выберите плоскость, нарисуйте замкнутый контур — и выдавите его в твёрдое тело.",
    cta: "Создать эскиз",
    hotkey: "S",
    variant: "center",
  },
  extrude: {
    title: "Эскиз готов",
    body: "Теперь придайте ему толщину — выдавливание превратит контур в тело.",
    cta: "Выдавить",
    hotkey: "E",
    variant: "center",
  },
  refine: {
    title: "Тело построено",
    body: "Скруглите рёбра или выгрузите модель в STEP/STL через меню «Файл».",
    cta: "Скруглить рёбра",
    hotkey: "F",
    variant: "pill",
  },
};

export function useOnboarding(deps: {
  model: ReturnType<typeof useDocumentModel>;
  loading: Ref<boolean>;
  busy: Ref<boolean>;
}) {
  const { model, loading, busy } = deps;
  const dismissed = ref(new Set<OnboardingStep>());

  const currentStep = computed<OnboardingStep | null>(() => {
    if (loading.value || busy.value) return null;
    if (model.sketches.value.length === 0 && model.bodies.value.length === 0) return "sketch";
    const freeSketch = model.sketches.value.some((s) => !model.sketchHasFeature(s.id));
    if (freeSketch) return "extrude";
    if (model.bodies.value.length === 0) return null;
    const refined = model.timelineEntries.value.some(
      (e) => e.kind === "fillet" || e.kind === "chamfer",
    );
    return refined ? null : "refine";
  });

  // Подсказка во весь вьюпорт уместна только на пустом документе: поверх
  // готовой модели она закрывает деталь и мешает целиться по ней мышью.
  const hint = computed<OnboardingHint | null>(() => {
    const step = currentStep.value;
    if (!step || dismissed.value.has(step)) return null;
    const base = HINTS[step];
    return { step, ...base, variant: model.bodies.value.length > 0 ? "pill" : base.variant };
  });

  function dismiss(step: OnboardingStep) {
    dismissed.value = new Set(dismissed.value).add(step);
  }

  return { hint, dismiss };
}
