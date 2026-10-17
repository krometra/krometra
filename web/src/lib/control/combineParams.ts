import { fail } from "./protocol";

export function combineToolIds(targetBodyId: string, toolBodyId: string | undefined, toolBodyIds: string[] | undefined): string[] {
  const tools = [...new Set([...(toolBodyId === undefined ? [] : [toolBodyId]), ...(toolBodyIds ?? [])])];
  if (tools.length === 0) throw fail("invalid_params", "Задайте toolBodyIds (или toolBodyId) — хотя бы одно тело-инструмент.");
  if (tools.includes(targetBodyId)) throw fail("invalid_params", "Цель и инструмент должны быть разными телами.");
  return tools;
}

export function cutTargetIds(operation: string | undefined, targetBodyId: string | undefined, targetBodyIds: string[] | undefined): string[] | undefined {
  if (targetBodyIds === undefined) return undefined;
  if (operation !== "cut") throw fail("invalid_params", "Список targetBodyIds задаётся только для operation = cut.");
  if (targetBodyId !== undefined) throw fail("invalid_params", "Задайте либо targetBodyId, либо targetBodyIds.");
  return [...new Set(targetBodyIds)];
}
