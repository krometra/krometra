import { computed, ref, watch, type Ref } from "vue";
import { useBodyPick } from "@/composables/shared/useBodyPick";
import { defaultCutTargets, liveCutTargets, toggledBody, type PickableBody } from "@/lib/bodyPickList";
import type { ViewportRef } from "./types";

export function useCutTargets(deps: {
  viewportRef: ViewportRef;
  bodies: Readonly<Ref<PickableBody[]>>;
  active: Readonly<Ref<boolean>>;
}) {
  const { viewportRef, bodies, active } = deps;
  const bodyPick = useBodyPick();
  const selected = ref<string[]>([]);
  const targetIds = computed(() => liveCutTargets(selected.value, bodies.value));

  function paint() {
    viewportRef.value?.setBodyRoles({ targetId: null, toolIds: active.value ? targetIds.value : [] });
  }

  function set(bodyIds: string[]) {
    selected.value = [...new Set(bodyIds)];
    paint();
  }

  function toggle(bodyId: string) {
    set(toggledBody(selected.value, bodyId));
  }

  function remove(bodyId: string) {
    set(selected.value.filter((id) => id !== bodyId));
  }

  function pickFromScene(bodyId: string): boolean {
    if (!active.value) return false;
    toggle(bodyId);
    return true;
  }

  watch(active, (isActive) => {
    if (isActive) {
      bodyPick.claim(toggle);
      set(defaultCutTargets(bodies.value));
      return;
    }
    bodyPick.release(toggle);
    paint();
  }, { flush: "sync" });

  return { targetIds, set, toggle, remove, pickFromScene };
}

export type CutTargetsApi = ReturnType<typeof useCutTargets>;
