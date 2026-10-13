import { onMounted, onUnmounted, type Ref } from "vue";
import type { SketchEntity, SketchPoint } from "@/types/api";
import { entityBBox } from "@/sketcher/entityGeometry";
import {
  screenToWorld as toWorld,
  worldToScreen as toScreen,
  visibleWorldBounds as worldBounds,
} from "@/sketcher/viewCoordinates";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 50;
const ZOOM_STEP = 1.1;
const FIT_PADDING = 0.8;

/**
 * Вид 2D-канвы: панорама, зум, ресайз под devicePixelRatio и подгонка
 * под содержимое. Владелец offset/zoom — только этот composable.
 */
export function useCanvasViewport(deps: {
  canvasRef: Ref<HTMLCanvasElement | null>;
  containerRef: Ref<HTMLDivElement | null>;
  render: () => void;
}) {
  const { canvasRef, containerRef, render } = deps;

  let offsetX = 0;
  let offsetY = 0;
  let zoom = 1.0;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOffsetStartX = 0;
  let panOffsetStartY = 0;

  let resizeObserver: ResizeObserver | null = null;

  const dpr = () => window.devicePixelRatio || 1;

  function cssSize() {
    const canvas = canvasRef.value;
    if (!canvas) return { width: 0, height: 0 };
    return { width: canvas.width / dpr(), height: canvas.height / dpr() };
  }

  function visibleWorldBounds() {
    const { width, height } = cssSize();
    return worldBounds(width, height, { offsetX, offsetY, zoom });
  }

  function viewParams() {
    return { zoom, bounds: visibleWorldBounds() };
  }

  function applyTransform(ctx: CanvasRenderingContext2D) {
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, -zoom);
  }

  function screenToWorld(sx: number, sy: number): SketchPoint {
    return toWorld(sx, sy, { offsetX, offsetY, zoom });
  }

  function worldToScreen(wx: number, wy: number): SketchPoint {
    return toScreen(wx, wy, { offsetX, offsetY, zoom });
  }

  function canvasPos(e: MouseEvent): SketchPoint | null {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startPan(e: MouseEvent) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOffsetStartX = offsetX;
    panOffsetStartY = offsetY;
  }

  function updatePan(e: MouseEvent): boolean {
    if (!isPanning) return false;
    offsetX = panOffsetStartX + (e.clientX - panStartX);
    offsetY = panOffsetStartY + (e.clientY - panStartY);
    render();
    return true;
  }

  function endPan() {
    isPanning = false;
  }

  function zoomAt(e: WheelEvent) {
    const pos = canvasPos(e);
    if (!pos) return;

    const world = screenToWorld(pos.x, pos.y);

    zoom =
      e.deltaY < 0
        ? Math.min(MAX_ZOOM, zoom * ZOOM_STEP)
        : Math.max(MIN_ZOOM, zoom / ZOOM_STEP);

    offsetX = pos.x - world.x * zoom;
    offsetY = pos.y + world.y * zoom;
    render();
  }

  function centerView() {
    const { width, height } = cssSize();
    offsetX = width / 2;
    offsetY = height / 2;
    zoom = 1.0;
    render();
  }

  function fitToView(entities: SketchEntity[]) {
    const finite = entities.filter((e) => e.type !== "infline");
    if (finite.length === 0) {
      centerView();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const entity of finite) {
      const bbox = entityBBox(entity);
      minX = Math.min(minX, bbox.x1);
      minY = Math.min(minY, bbox.y1);
      maxX = Math.max(maxX, bbox.x2);
      maxY = Math.max(maxY, bbox.y2);
    }

    const { width, height } = cssSize();
    if (width === 0 || height === 0) return;

    const worldW = maxX - minX || 100;
    const worldH = maxY - minY || 100;

    zoom = Math.min((width * FIT_PADDING) / worldW, (height * FIT_PADDING) / worldH);
    offsetX = width / 2 - ((minX + maxX) / 2) * zoom;
    offsetY = height / 2 + ((minY + maxY) / 2) * zoom;
    render();
  }

  function handleResize() {
    const container = containerRef.value;
    const canvas = canvasRef.value;
    if (!container || !canvas) return;

    const ratio = dpr();
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    canvas.getContext("2d")?.scale(ratio, ratio);
    render();
  }

  onMounted(() => {
    handleResize();
    resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.value) resizeObserver.observe(containerRef.value);

    const { width, height } = cssSize();
    offsetX = width / 2;
    offsetY = height / 2;
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return {
    viewParams,
    applyTransform,
    screenToWorld,
    worldToScreen,
    canvasPos,
    startPan,
    updatePan,
    endPan,
    zoomAt,
    centerView,
    fitToView,
    getZoom: () => zoom,
    getOffset: () => ({ offsetX, offsetY }),
  };
}

export type CanvasViewportApi = ReturnType<typeof useCanvasViewport>;
