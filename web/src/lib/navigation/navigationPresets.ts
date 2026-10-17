export type NavigationPresetId = "krometra" | "fusion" | "solidworks" | "kompas" | "onshape";
export type CameraAction = "rotate" | "pan" | "zoom";
export type OrbitButton = "ROTATE" | "PAN" | "DOLLY" | "NONE";

export interface PointerButtonInput {
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

type ButtonName = "left" | "middle" | "right";
type Modifier = "none" | "shift" | "ctrl";
type ButtonBindings = Partial<Record<Modifier, CameraAction>>;

export interface NavigationPreset {
  id: NavigationPresetId;
  label: string;
  buttons: Partial<Record<ButtonName, ButtonBindings>>;
}

export const DEFAULT_PRESET: NavigationPresetId = "krometra";

export const NAVIGATION_PRESETS: readonly NavigationPreset[] = [
  {
    id: "krometra",
    label: "Крометра",
    buttons: {
      left: { none: "rotate", shift: "pan", ctrl: "pan" },
      middle: { none: "zoom" },
      right: { none: "pan", shift: "rotate", ctrl: "rotate" },
    },
  },
  {
    id: "fusion",
    label: "Fusion 360",
    buttons: { middle: { none: "pan", shift: "rotate" } },
  },
  {
    id: "solidworks",
    label: "SolidWorks",
    buttons: { middle: { none: "rotate", ctrl: "pan", shift: "zoom" } },
  },
  {
    id: "kompas",
    label: "КОМПАС-3D",
    buttons: { middle: { none: "rotate", shift: "pan", ctrl: "zoom" } },
  },
  {
    id: "onshape",
    label: "Onshape",
    buttons: { right: { none: "rotate", ctrl: "pan" }, middle: { none: "pan" } },
  },
];

const BUTTON_NAMES: Record<number, ButtonName> = { 0: "left", 1: "middle", 2: "right" };
const BUTTON_LABELS: Record<ButtonName, string> = { left: "ЛКМ", middle: "СКМ", right: "ПКМ" };
const MODIFIER_LABELS: Record<Modifier, string> = { none: "", shift: "Shift+", ctrl: "Ctrl+" };
const ACTION_LABELS: Record<CameraAction, string> = { rotate: "вращение", pan: "панорама", zoom: "зум" };

export function isNavigationPresetId(value: unknown): value is NavigationPresetId {
  return NAVIGATION_PRESETS.some((preset) => preset.id === value);
}

export function navigationPreset(id: NavigationPresetId): NavigationPreset {
  return NAVIGATION_PRESETS.find((preset) => preset.id === id) ?? NAVIGATION_PRESETS[0];
}

function modifierOf(input: PointerButtonInput): Modifier {
  if (input.shiftKey) return "shift";
  if (input.ctrlKey || input.metaKey) return "ctrl";
  return "none";
}

export function mouseDragAction(id: NavigationPresetId, input: PointerButtonInput): CameraAction | null {
  const name = BUTTON_NAMES[input.button];
  const bindings = name ? navigationPreset(id).buttons[name] : undefined;
  if (!bindings) return null;
  return bindings[modifierOf(input)] ?? bindings.none ?? null;
}

export function orbitButtonFor(action: CameraAction | null, input: PointerButtonInput): OrbitButton {
  const modified = input.shiftKey || input.ctrlKey || input.metaKey;
  if (action === "zoom") return "DOLLY";
  if (action === "rotate") return modified ? "PAN" : "ROTATE";
  if (action === "pan") return modified ? "ROTATE" : "PAN";
  return "NONE";
}

export function presetHints(id: NavigationPresetId): string[] {
  const hints: string[] = [];
  for (const [name, bindings] of Object.entries(navigationPreset(id).buttons) as [ButtonName, ButtonBindings][]) {
    for (const [modifier, action] of Object.entries(bindings) as [Modifier, CameraAction][]) {
      hints.push(`${MODIFIER_LABELS[modifier]}${BUTTON_LABELS[name]} - ${ACTION_LABELS[action]}`);
    }
  }
  hints.push("Колесо - зум к курсору");
  return hints;
}
