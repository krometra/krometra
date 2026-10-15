import type { Ref } from "vue";
import type ViewportContainer from "@/components/viewport/ViewportContainer.vue";

export type RenderingMode = "shaded" | "shaded_edges" | "wireframe" | "hidden_line";
export type SelectionMode = "face" | "body" | "edge" | "measure" | "none";

export type ViewportRef = Ref<InstanceType<typeof ViewportContainer> | undefined>;

export type RibbonAction = "sketch" | "extrude" | "revolve" | "sweep" | "boolean" | "fillet" | "chamfer" | "thread" | "shell" | "mirror" | "hole" | "measure" | "pattern";

export type TreeItemKind = "sketch" | "body" | "feature";

export interface CtxItem {
  label: string;
  danger?: boolean;
  action: () => void;
}
