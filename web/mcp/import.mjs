import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ToolError } from "./errors.mjs";

const STEP_EXTENSIONS = [".step", ".stp"];
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

function expandHome(rawPath) {
  return rawPath === "~" || rawPath.startsWith("~/") ? path.join(homedir(), rawPath.slice(1)) : rawPath;
}

export async function readStepFile(rawPath) {
  const expanded = expandHome(rawPath);
  if (!path.isAbsolute(expanded)) throw new ToolError(`Параметр path должен быть абсолютным путём STEP-файла, получено "${rawPath}".`);
  const file = path.resolve(expanded);
  if (!STEP_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
    throw new ToolError(`Файл ${file}: ожидается STEP с расширением ${STEP_EXTENSIONS.join(" или ")}.`);
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new ToolError(`Файла ${file} нет или это не файл.`);
  if (info.size > MAX_IMPORT_BYTES) {
    throw new ToolError(`Файл ${file} занимает ${Math.round(info.size / 1048576)} МБ — больше предела ${MAX_IMPORT_BYTES / 1048576} МБ.`);
  }
  return { fileName: path.basename(file), dataBase64: (await readFile(file)).toString("base64") };
}
