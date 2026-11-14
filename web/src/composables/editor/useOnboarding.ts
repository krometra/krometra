import { useI18n } from "@/composables/shared/useI18n";
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


export function useOnboarding(deps: {
  model: ReturnType<typeof useDocumentModel>;
  loading: Ref<boolean>;
  busy: Ref<boolean>;
}) {
  const { t: tr } = useI18n();
  const HINTS = computed<Record<OnboardingStep, Omit<OnboardingHint, "step">>>(() => ({
    sketch: {
      title: tr("editorOps.onboardSketch"),
      body: tr("editorOps.onboardSketchBody"),
      cta: tr("editorOps.createSketch"),
      hotkey: "S",
      variant: "center",
    },
    extrude: {
      title: tr("editorOps.onboardExtrude"),
      body: tr("editorOps.onboardExtrudeBody"),
      cta: tr("editorOps.extrude"),
      hotkey: "E",
      variant: "center",
    },
    refine: {
      title: tr("editorOps.onboardRefine"),
      body: tr("editorOps.onboardRefineBody"),
      cta: tr("editorOps.onboardFillet"),
      hotkey: "F",
      variant: "pill",
    },
  }));


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
    const base = HINTS.value[step];
    return { step, ...base, variant: model.bodies.value.length > 0 ? "pill" : base.variant };
  });

  function dismiss(step: OnboardingStep) {
    dismissed.value = new Set(dismissed.value).add(step);
  }

  return { hint, dismiss };
}
