import type { Ref } from "vue";
import type ViewportContainer from "@/components/viewport/ViewportContainer.vue";

export type RenderingMode = "shaded" | "shaded_edges" | "wireframe" | "hidden_line";
export type SelectionMode = "face" | "body" | "edge" | "measure" | "pick" | "none";

export type ViewportRef = Ref<InstanceType<typeof ViewportContainer> | undefined>;

export type RibbonAction = "sketch" | "extrude" | "revolve" | "sweep" | "loft" | "boolean" | "fillet" | "chamfer" | "thread" | "shell" | "mirror" | "hole" | "measure" | "pattern" | "draft" | "press_pull" | "plane";

export type TreeItemKind = "sketch" | "body" | "feature" | "plane";

export interface CtxItem {
  label: string;
  danger?: boolean;
  action: () => void;
}
