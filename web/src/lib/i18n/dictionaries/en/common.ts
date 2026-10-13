import type { Translation } from "../../message";
import type { common as source } from "../ru/common";

export const common: Translation<typeof source> = {
  "common.productName": "Krometra",
  "common.documentTitle": "{product} — parametric 3D CAD in the browser",
  "common.language": "Interface language",
  "common.languageLoadFailed": "Could not load the language. Check your connection and try again.",
};
