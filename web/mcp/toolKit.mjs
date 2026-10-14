import { ToolError } from "./errors.mjs";

export const NO_PARAMS = { type: "object", properties: {} };
export const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

export const prose = (...sentences) => sentences.join(" ");
export const text = (value) => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) });
export const image = (shot) => ({ type: "image", data: shot.dataBase64, mimeType: shot.mime });

export function requireString(args, name) {
  const value = typeof args[name] === "string" ? args[name].trim() : "";
  if (!value) throw new ToolError(`Параметр ${name} обязателен (непустая строка).`);
  return value;
}

export function optionalObject(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolError(`Параметр ${name} должен быть объектом.`);
  }
  return value;
}

export function optionalIdList(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  const isIdList = Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "string" && id);
  if (!isIdList) throw new ToolError(`Параметр ${name}: непустой массив id либо не указывай параметр вовсе.`);
  return value;
}

export function choice(args, name, allowed, fallback) {
  const value = args[name] ?? fallback;
  if (!allowed.includes(value)) throw new ToolError(`Параметр ${name}: допустимо ${allowed.join(" | ")}.`);
  return value;
}
