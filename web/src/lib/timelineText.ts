import type { MessageDescriptor } from "./i18n/catalog";

const TOKENS = [
  ["насквозь", "timeline.through"], ["по грани", "timeline.onFace"],
  ["от грани", "timeline.fromFace"], ["новое тело", "timeline.newBody"],
  ["объед.", "timeline.merged"], ["копия", "timeline.copy"],
  ["проф.", "timeline.profiles"], ["граней:", "timeline.faces"],
  ["линейный", "timeline.linear"], ["гладкий", "timeline.smooth"],
  ["шаг", "timeline.spacing"], ["шт.", "timeline.pieces"],
  ["гр.", "timeline.faceShort"], ["мм", "timeline.mm"], ["от", "timeline.fromPlane"],
] as const;

export function timelineText(value: string, translate: (message: MessageDescriptor) => string): string {
  const replacements = new Map<string, string>(TOKENS.map(([source, key]) => [source, translate({ key })]));
  return value.replace(/насквозь|по грани|от грани|новое тело|объед\.|копия|проф\.|граней:|линейный|гладкий|шаг|шт\.|гр\.|мм|от(?= [XYZ])/g, (match) => replacements.get(match) ?? match);
}
