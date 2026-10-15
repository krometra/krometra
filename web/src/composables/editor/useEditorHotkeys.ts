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

export const EDITOR_SHORTCUTS: Shortcut[] = [
  { keys: "S", description: "Создать эскиз", group: "Построение" },
  { keys: "E", description: "Выдавить эскиз", group: "Построение" },
  { keys: "R", description: "Вращать эскиз", group: "Построение" },
  { keys: "F", description: "Скругление рёбер", group: "Построение" },
  { keys: "Shift + F", description: "Фаска на рёбрах", group: "Построение" },
  { keys: "Ctrl + Z", description: "Отменить", group: "История" },
  { keys: "Ctrl + Y", description: "Повторить", group: "История" },
  { keys: "Delete", description: "Удалить выбранную операцию", group: "История" },
  { keys: "Esc", description: "Отменить режим, снять выделение", group: "Навигация" },
  { keys: "?", description: "Список горячих клавиш", group: "Навигация" },
  { keys: "ЛКМ", description: "Выбрать грань / ребро", group: "Вьюпорт" },
  { keys: "Колесо", description: "Приблизить / отдалить", group: "Вьюпорт" },
  { keys: "ПКМ + движение", description: "Панорамировать", group: "Вьюпорт" },
];

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
