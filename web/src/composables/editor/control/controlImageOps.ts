import { base64ToBytes } from "@/lib/control/base64";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { INVALID, param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { drawLabels, type LabelMark, type LabelStyle } from "./canvasImages";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function point(value: unknown): { x: number; y: number } | null {
  const raw = value as Record<string, unknown> | null;
  return raw && finite(raw.x) && finite(raw.y) ? { x: raw.x, y: raw.y } : null;
}

function readMark(raw: Record<string, unknown>): LabelMark | typeof INVALID {
  const anchor = point(raw.anchor);
  const box = raw.box as Record<string, unknown> | null;
  if (!anchor || typeof raw.text !== "string" || !box || ![box.x, box.y, box.width, box.height].every(finite)) return INVALID;
  return { text: raw.text, anchor, box: { x: box.x as number, y: box.y as number, width: box.width as number, height: box.height as number } };
}

function readStyle(raw: Record<string, unknown>): LabelStyle | typeof INVALID {
  const texts = [raw.accent, raw.background, raw.text, raw.font];
  const numbers = [raw.padding, raw.dotRadius, raw.lineWidth];
  if (!texts.every((value) => typeof value === "string") || !numbers.every(finite)) return INVALID;
  return raw as unknown as LabelStyle;
}

export function imageOps(): ControlOp[] {
  return [
    defineOp({
      op: "image.drawLabels",
      description:
        "Служебная операция MCP-сервера: наносит подписи на PNG-снимок (выноска, плашка с текстом, точка привязки). Возвращает { mime: \"image/png\", dataBase64 }. Модель не меняет.",
      params: {
        dataBase64: param.string("PNG в base64, обычно из viewport.capture."),
        marks: param.list(
          param.object("Подпись.", "{ text, anchor: { x, y }, box: { x, y, width, height } }", readMark),
          "Подписи в пикселях снимка.",
          0,
        ),
        style: param.object("Оформление подписей.", "{ accent, background, text, font, padding, dotRadius, lineWidth }", readStyle),
      },
      run: async ({ dataBase64, marks, style }) => {
        const png = base64ToBytes(dataBase64);
        if (!png) throw fail("invalid_params", "Параметр «dataBase64»: ожидается PNG в base64.");
        return { mime: "image/png", dataBase64: await drawLabels(png, marks, style) };
      },
    }),
  ];
}
