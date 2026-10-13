import type { DomainMessages } from "../../message";

export const common = {
  "common.productName": "Крометра",
  "common.documentTitle": "{product} — параметрическая 3D-САПР в браузере",
  "common.language": "Язык интерфейса",
  "common.languageLoadFailed": "Не удалось загрузить язык. Проверьте подключение и попробуйте ещё раз.",
} as const satisfies DomainMessages<"common">;
