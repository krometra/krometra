/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_LOCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
