declare module "@krometra/ui-kit" {
  import type { Component } from "vue";

  export const KButton: Component;
  export const KCheckbox: Component;
  export const KInput: Component;
  export const KSegmented: Component;
  export const KSwitch: Component;
  export const KTable: Component;
  export function applyTheme(options: Record<string, string>): void;
}
