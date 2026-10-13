import { ToolError } from "./errors.mjs";

export const SUPPORTED_VERSION = 1;

const ERROR_HINTS = {
  unknown_op: "Такой операции нет: сверься со списком из cad_capabilities.",
  invalid_params: "Параметры не подошли: сверь имена и типы с описанием операции в cad_capabilities.",
  not_ready: "Редактор ещё не готов: повтори вызов чуть позже или открой проект заново через cad_open_project.",
  busy: "Сейчас выполняется другая мутирующая операция: повтори вызов через 1-2 секунды.",
  wrong_mode: "Операция недоступна в текущем режиме редактора: посмотри mode в cad_state.",
  not_found: "Объект с таким id не найден: возьми актуальные id из cad_state или topology.",
  operation_failed: "Ядро не выполнило операцию: проверь параметры и состояние модели по cad_state.",
};

export function isReply(value) {
  if (!value || typeof value !== "object" || typeof value.ok !== "boolean") return false;
  return value.ok || typeof value.error?.code === "string";
}

export function errorHint(reply) {
  return ERROR_HINTS[reply.error.code] ?? "";
}

export function unwrap(reply) {
  if (reply.ok) return reply.result;
  const { code, message } = reply.error;
  throw new ToolError([`${reply.op ?? "op"}: ${code} - ${message}`, errorHint(reply)].filter(Boolean).join("\n"));
}
