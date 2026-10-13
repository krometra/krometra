declare module "foxy-ui-kit" {
  import type { Component } from "vue";

  export const FxButton: Component;
  export const FxCheckbox: Component;
  export const FxInput: Component;
  export function applyTheme(options: Record<string, string>): void;
}
