export type BrowserBooleanOperation = "union" | "subtract" | "intersect";
export type BrowserExtrudeOperation = "new_body" | "join" | "cut";

export function browserBooleanOfExtrude(operation: BrowserExtrudeOperation): BrowserBooleanOperation | null {
  if (operation === "join") return "union";
  if (operation === "cut") return "subtract";
  return null;
}

export function assertNonEmptyBrowserBoolean(resultVolume: number) {
  if (!(resultVolume > 1e-9)) throw new Error("Результат булевой операции пуст — тела не пересекаются.");
}

export function assertBrowserVolumeChanged(operation: BrowserExtrudeOperation, before: number, after: number) {
  if (Math.abs(after - before) > Math.max(1e-6, before * 1e-7)) return;
  const verb = operation === "cut" ? "Вырез" : "Приклеивание";
  throw new Error(
    `${verb} не изменил объём тела — инструмент не пересёк тело. `
    + "Проверьте расстояние и переключатель «Реверс» в панели выдавливания.",
  );
}
