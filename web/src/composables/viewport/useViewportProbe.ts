import type { Vec3 } from "@/lib/threadGeometry";
import type { SceneContext } from "./types";
import {
  cameraForView,
  projectToClient,
  threadPreviewSnapshot,
  visibleSceneBodyIds,
  type CameraView,
  type CanvasRect,
} from "./sceneProbe";

export function useViewportProbe(context: SceneContext) {
  function canvasRect(): CanvasRect {
    const rect = context.renderer().domElement.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function projectPoints(points: Vec3[], view?: CameraView) {
    if (!context.ready()) return null;
    const camera = view ? cameraForView(context.camera(), view) : context.camera();
    const canvas = canvasRect();
    return { points: projectToClient(camera, canvas, points), canvas };
  }

  function inspectScene() {
    if (!context.ready()) return null;
    const scene = context.scene();
    return { visibleBodyIds: visibleSceneBodyIds(scene), threadPreview: threadPreviewSnapshot(scene) };
  }

  return { projectPoints, inspectScene };
}
