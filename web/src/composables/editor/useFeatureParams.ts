import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { apiErrorMessage } from "@/composables/useToast";
import {
  changedParams,
  editableValues,
  featureParamFields,
  isValidParams,
  type FeatureParamValue,
} from "@/lib/browserFeatureParams";
import type { MeshData, TimelineEntry } from "@/types/api";

const REBUILD_DELAY_MS = 600;

export function useFeatureParams(deps: {
  projectId: () => string;
  entry: Ref<TimelineEntry | null>;
  onMeshUpdated: (bodyId: string, mesh: MeshData) => void;
}) {
  const documentStore = useDocument();
  const undoRedo = useUndoRedo();
  const baseline = ref<Record<string, FeatureParamValue>>({});
  const values = ref<Record<string, FeatureParamValue>>({});
  const pending = ref(false);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fields = computed(() => (deps.entry.value ? featureParamFields(deps.entry.value, values.value) : []));

  function reset(entry: TimelineEntry | null) {
    baseline.value = entry ? editableValues(entry) : {};
    values.value = { ...baseline.value };
    error.value = null;
  }

  watch(() => deps.entry.value, (entry) => {
    if (!timer && !pending.value) reset(entry);
  }, { immediate: true });

  async function apply() {
    const entry = deps.entry.value;
    const change = changedParams(baseline.value, values.value);
    if (!entry || !change || !isValidParams(values.value)) return;
    pending.value = true;
    error.value = null;
    try {
      const { BrowserRebuildCommand } = await import("@/core/commands/BrowserRebuildCommand");
      await undoRedo.execute(new BrowserRebuildCommand(deps.projectId(), entry.id, change.previous, change.next, deps.onMeshUpdated));
      baseline.value = { ...values.value };
      await documentStore.load(deps.projectId());
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось перестроить модель");
    } finally {
      pending.value = false;
    }
  }

  function update(key: string, value: FeatureParamValue) {
    values.value = { ...values.value, [key]: value };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void apply();
    }, REBUILD_DELAY_MS);
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });

  return { values, fields, pending, error, update };
}
