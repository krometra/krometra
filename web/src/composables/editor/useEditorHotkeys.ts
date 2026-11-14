import { onMounted, onUnmounted } from "vue";

export interface Shortcut {
  keys: string;
  description: string;
  group: string;
}

// Раскладка не переключается вместе с фокусом, поэтому каждая латинская
// клавиша слушается вместе со своим кириллическим соседом по ЙЦУКЕН.
const LAYOUT_TWINS: Record<string, string> = {
  s: "ы",
  e: "у",
  r: "к",
  f: "а",
};

type ShortcutTranslator = (key: "editorOps.shortcutBuild" | "editorOps.shortcutHistory" | "editorOps.shortcutNavigation" | "editorOps.shortcutViewport" | "editorOps.shortcutSketch" | "editorOps.shortcutExtrude" | "editorOps.shortcutRevolve" | "editorOps.shortcutFillet" | "editorOps.shortcutChamfer" | "editorOps.shortcutUndo" | "editorOps.shortcutRedo" | "editorOps.shortcutDelete" | "editorOps.shortcutEscape" | "editorOps.shortcutList" | "editorOps.shortcutSelect" | "editorOps.shortcutZoom" | "editorOps.shortcutPan" | "editorOps.shortcutLmb" | "editorOps.shortcutWheel" | "editorOps.shortcutRmbMove") => string;

export function editorShortcuts(tr: ShortcutTranslator): Shortcut[] {
  return [
  { keys: "S", description: tr("editorOps.shortcutSketch"), group: tr("editorOps.shortcutBuild") },
  { keys: "E", description: tr("editorOps.shortcutExtrude"), group: tr("editorOps.shortcutBuild") },
  { keys: "R", description: tr("editorOps.shortcutRevolve"), group: tr("editorOps.shortcutBuild") },
  { keys: "F", description: tr("editorOps.shortcutFillet"), group: tr("editorOps.shortcutBuild") },
  { keys: "Shift + F", description: tr("editorOps.shortcutChamfer"), group: tr("editorOps.shortcutBuild") },
  { keys: "Ctrl + Z", description: tr("editorOps.shortcutUndo"), group: tr("editorOps.shortcutHistory") },
  { keys: "Ctrl + Y", description: tr("editorOps.shortcutRedo"), group: tr("editorOps.shortcutHistory") },
  { keys: "Delete", description: tr("editorOps.shortcutDelete"), group: tr("editorOps.shortcutHistory") },
  { keys: "Esc", description: tr("editorOps.shortcutEscape"), group: tr("editorOps.shortcutNavigation") },
  { keys: "?", description: tr("editorOps.shortcutList"), group: tr("editorOps.shortcutNavigation") },
  { keys: tr("editorOps.shortcutLmb"), description: tr("editorOps.shortcutSelect"), group: tr("editorOps.shortcutViewport") },
  { keys: tr("editorOps.shortcutWheel"), description: tr("editorOps.shortcutZoom"), group: tr("editorOps.shortcutViewport") },
  { keys: tr("editorOps.shortcutRmbMove"), description: tr("editorOps.shortcutPan"), group: tr("editorOps.shortcutViewport") },
  ];
}

export function useEditorHotkeys(handlers: {
  onEscape: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canRunTool: () => boolean;
  onSketch: () => void;
  onExtrude: () => void;
  onRevolve: () => void;
  onFilletChamfer: () => void;
  onChamfer: () => void;
  onToggleHelp: () => void;
  onDelete: () => void;
}) {
  const toolKeys: Record<string, () => void> = {
    s: handlers.onSketch,
    e: handlers.onExtrude,
    r: handlers.onRevolve,
    f: handlers.onFilletChamfer,
  };

  function isTypingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return (
      !!t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
    );
  }

  function normalizeKey(key: string): string {
    const lower = key.toLowerCase();
    const latin = Object.keys(LAYOUT_TWINS).find((k) => LAYOUT_TWINS[k] === lower);
    return latin ?? lower;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handlers.onEscape();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      // В поле ввода Ctrl+Z — это отмена набранного текста, а не операции
      // модели: перехватывать её нельзя.
      if (isTypingTarget(e)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handlers.onUndo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        handlers.onRedo();
      }
      return;
    }
    if (isTypingTarget(e) || e.altKey) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (!handlers.canRunTool()) return;
      e.preventDefault();
      handlers.onDelete();
      return;
    }

    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      handlers.onToggleHelp();
      return;
    }

    const key = normalizeKey(e.key);
    if (key === "f" && e.shiftKey) {
      if (!handlers.canRunTool()) return;
      e.preventDefault();
      handlers.onChamfer();
      return;
    }
    if (e.shiftKey) return;

    const run = toolKeys[key];
    if (run && handlers.canRunTool()) {
      e.preventDefault();
      run();
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
}
