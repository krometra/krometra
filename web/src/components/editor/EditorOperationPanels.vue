<script setup lang="ts">
import { useSketch } from "@/composables/shared/useSketch";
import PropertiesPanel from "@/components/properties/PropertiesPanel.vue";
import SketchPropsPanel from "./SketchPropsPanel.vue";
import ExtrudeRevolvePanel from "./ExtrudeRevolvePanel.vue";
import BooleanPanel from "./BooleanPanel.vue";
import FilletChamferPanel from "./FilletChamferPanel.vue";
import ThreadPanel from "./ThreadPanel.vue";
import ShellPanel from "./ShellPanel.vue";
import DraftPanel from "./DraftPanel.vue";
import PressPullPanel from "./PressPullPanel.vue";
import MirrorPanel from "./MirrorPanel.vue";
import SweepPanel from "./SweepPanel.vue";
import LoftPanel from "./LoftPanel.vue";
import HolePanel from "./HolePanel.vue";
import MeasurePanel from "./MeasurePanel.vue";
import PatternPanel from "./PatternPanel.vue";
import WorkPlanePanel from "./WorkPlanePanel.vue";
import type { ExtrudeRevolveApi } from "@/composables/editor/useExtrudeRevolve";
import type { BooleanModeApi } from "@/composables/editor/useBooleanMode";
import type { FilletChamferApi } from "@/composables/editor/useFilletChamfer";
import type { ThreadApi } from "@/composables/editor/useThread";
import type { ShellApi } from "@/composables/editor/useShell";
import type { DraftApi } from "@/composables/editor/useDraft";
import type { PressPullApi } from "@/composables/editor/usePressPull";
import type { MirrorApi } from "@/composables/editor/useMirror";
import type { SweepApi } from "@/composables/editor/useSweep";
import type { LoftApi } from "@/composables/editor/useLoft";
import type { HoleApi } from "@/composables/editor/useHole";
import type { MeasureApi } from "@/composables/editor/useMeasure";
import type { PatternApi } from "@/composables/editor/usePattern";
import type { WorkPlanesApi } from "@/composables/editor/useWorkPlanes";
import type { MeshData } from "@/types/api";

export interface OperationPanels {
  extrude: ExtrudeRevolveApi;
  booleanMode: BooleanModeApi;
  filletChamfer: FilletChamferApi;
  thread: ThreadApi;
  shell: ShellApi;
  draft: DraftApi;
  pressPull: PressPullApi;
  mirror: MirrorApi;
  sweep: SweepApi;
  loft: LoftApi;
  hole: HoleApi;
  measure: MeasureApi;
  pattern: PatternApi;
  workPlanes: WorkPlanesApi;
}

defineProps<{ panels: OperationPanels }>();
const emit = defineEmits<{
  "sketch-ok": [];
  "sketch-cancel": [];
  "edit-sketch": [sketchId: string];
  rebuilt: [payload: { bodyId: string; mesh: MeshData }];
}>();

const sketch = useSketch();
</script>

<template>
  <SketchPropsPanel v-if="sketch.sketchMode.value" @ok="emit('sketch-ok')" @cancel="emit('sketch-cancel')" />
  <ExtrudeRevolvePanel v-else-if="panels.extrude.lastSavedSketchId.value" :extrude="panels.extrude" />
  <FilletChamferPanel v-else-if="panels.filletChamfer.filletChamferMode.value" :fillet="panels.filletChamfer" />
  <ThreadPanel v-else-if="panels.thread.threadMode.value" :thread="panels.thread" />
  <ShellPanel v-else-if="panels.shell.shellMode.value" :shell="panels.shell" />
  <DraftPanel v-else-if="panels.draft.draftMode.value" :draft="panels.draft" />
  <PressPullPanel v-else-if="panels.pressPull.pressPullMode.value" :press-pull="panels.pressPull" />
  <MirrorPanel v-else-if="panels.mirror.mirrorMode.value" :mirror="panels.mirror" />
  <HolePanel v-else-if="panels.hole.holeMode.value" :hole="panels.hole" />
  <PatternPanel v-else-if="panels.pattern.patternMode.value" :pattern="panels.pattern" />
  <BooleanPanel v-else-if="panels.booleanMode.booleanMode.value" :boolean="panels.booleanMode" />
  <SweepPanel v-else-if="panels.sweep.sweepMode.value" :sweep="panels.sweep" />
  <LoftPanel v-else-if="panels.loft.loftMode.value" :loft="panels.loft" />
  <MeasurePanel v-else-if="panels.measure.active.value" :measure="panels.measure" />
  <WorkPlanePanel v-else-if="panels.workPlanes.panel.active.value" :tool="panels.workPlanes.panel" />
  <PropertiesPanel v-else @edit-sketch="emit('edit-sketch', $event)" @rebuilt="emit('rebuilt', $event)" />
</template>
