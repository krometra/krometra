import { onBeforeUnmount, onMounted, watch } from "vue";
import { createControlDispatcher } from "@/lib/control/dispatcher";
import { CONTROL_READY_EVENT, CONTROL_VERSION, type ControlChannel } from "@/lib/control/protocol";
import { useControlRelay } from "./useControlRelay";
import { createControlContext, type EditorControlDeps } from "./control/controlContext";
import { bodyOps } from "./control/controlBodyOps";
import { exportOps } from "./control/controlExportOps";
import { imageOps } from "./control/controlImageOps";
import { inspectOps } from "./control/controlInspectOps";
import { measureOps } from "./control/controlMeasureOps";
import { importOps } from "./control/controlImportOps";
import { mirrorOps } from "./control/controlMirrorOps";
import { loftOps } from "./control/controlLoftOps";
import { featureOps } from "./control/controlFeatureOps";
import { holeOps } from "./control/controlHoleOps";
import { historyOps } from "./control/controlHistoryOps";
import { patternOps } from "./control/controlPatternOps";
import { pressPullOps } from "./control/controlPressPullOps";
import { timelineOps } from "./control/controlTimelineOps";
import { readOps } from "./control/controlReadOps";
import { regionOps } from "./control/controlRegionOps";
import { shellOps } from "./control/controlShellOps";
import { draftOps } from "./control/controlDraftOps";
import { sketchOps } from "./control/controlSketchOps";
import { sketchConstraintOps } from "./control/controlSketchConstraintOps";
import { sketchModifyOps } from "./control/controlSketchModifyOps";
import { sketchSelectionOps } from "./control/controlSketchSelectionOps";
import { viewportOps } from "./control/controlViewportOps";
import { workPlaneOps } from "./control/controlWorkPlaneOps";

declare global {
  interface Window {
    cadControl?: ControlChannel;
  }
}

export function useEditorControl(deps: EditorControlDeps) {
  const context = createControlContext(deps);
  const dispatcher = createControlDispatcher({
    notReadyReason: context.notReadyReason,
    busyReason: context.busyReason,
  });
  dispatcher.register([
    ...readOps(context, dispatcher.busyReason),
    ...exportOps(context, dispatcher.busyReason),
    ...viewportOps(context),
    ...sketchOps(context),
    ...sketchConstraintOps(context),
    ...sketchModifyOps(context),
    ...sketchSelectionOps(context),
    ...regionOps(context),
    ...featureOps(context),
    ...shellOps(context),
    ...draftOps(context),
    ...holeOps(context),
    ...historyOps(context),
    ...timelineOps(context),
    ...bodyOps(context),
    ...patternOps(context),
    ...importOps(context),
    ...mirrorOps(context),
    ...loftOps(context),
    ...inspectOps(context),
    ...measureOps(context),
    ...pressPullOps(context),
    ...workPlaneOps(context),
    ...imageOps(),
  ]);

  const channel: ControlChannel = {
    version: CONTROL_VERSION,
    ready: dispatcher.ready,
    request: (req) => dispatcher.request(req),
  };

  watch(
    () => context.notReadyReason() === null,
    (ready) => {
      if (ready && dispatcher.markReady()) window.dispatchEvent(new Event(CONTROL_READY_EVENT));
    },
  );

  onMounted(() => {
    window.cadControl = channel;
  });

  onBeforeUnmount(() => {
    if (window.cadControl === channel) delete window.cadControl;
  });

  return { relay: useControlRelay({ projectId: deps.projectId, channel }) };
}
