import { onMounted, onUnmounted } from "vue";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";

const HOTKEY_TOOLS: Record<string, SketchToolName> = {
  v: "select", м: "select",
  l: "line", д: "line",
  r: "rectangle", к: "rectangle",
  c: "circle", с: "circle",
  a: "arc", ф: "arc",
  d: "dimension", в: "dimension",
  f: "fillet", а: "fillet",
  t: "trim", е: "trim",
};

const CONSTRUCTION_KEYS = new Set(["x", "ч"]);

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
}

export function useSketchHotkeys(handlers: {
  active: () => boolean;
  onEscape: () => void;
  onDelete: () => void;
  onToggleConstruction: () => void;
  onSelectTool: (tool: SketchToolName) => void;
}) {
  function onKeyDown(e: KeyboardEvent) {
    if (!handlers.active() || isTypingTarget(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      handlers.onEscape();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      handlers.onDelete();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyX" || CONSTRUCTION_KEYS.has(e.key.toLowerCase())) {
      e.preventDefault();
      handlers.onToggleConstruction();
      return;
    }
    const tool = HOTKEY_TOOLS[e.key.toLowerCase()];
    if (!tool) return;
    e.preventDefault();
    handlers.onSelectTool(tool);
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
}
