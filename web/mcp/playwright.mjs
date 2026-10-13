import { ToolError, firstLine } from "./errors.mjs";

let loading = null;

export function loadPlaywright() {
  loading ??= import("playwright").catch((error) => {
    throw new ToolError(`Пакет playwright не загрузился (${firstLine(error.message)}): выполни npm install в web/.`);
  });
  return loading;
}
