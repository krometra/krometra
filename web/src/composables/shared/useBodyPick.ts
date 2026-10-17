import { computed, shallowRef } from "vue";
import { createSharedComposable } from "@vueuse/core";

export type BodyPickHandler = (bodyId: string) => void;

export const useBodyPick = createSharedComposable(() => {
  const handler = shallowRef<BodyPickHandler | null>(null);

  function claim(next: BodyPickHandler) {
    handler.value = next;
  }

  function release(owner: BodyPickHandler) {
    if (handler.value === owner) handler.value = null;
  }

  function pick(bodyId: string): boolean {
    if (!handler.value) return false;
    handler.value(bodyId);
    return true;
  }

  return { claim, release, pick, active: computed(() => handler.value !== null) };
});
