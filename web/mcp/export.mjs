import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ToolError } from "./errors.mjs";

const EXTENSIONS = { stl: [".stl"], step: [".step", ".stp"] };

export const EXPORT_FORMATS = Object.keys(EXTENSIONS);

function expandHome(rawPath) {
  return rawPath === "~" || rawPath.startsWith("~/") ? path.join(homedir(), rawPath.slice(1)) : rawPath;
}

const statOf = (target) => stat(target).catch(() => null);

const alreadyExists = (file) => new ToolError(`Файл ${file} уже существует: передай overwrite: true или другой path.`);

export async function resolveTarget(rawPath, format) {
  const expanded = expandHome(rawPath);
  if (!path.isAbsolute(expanded)) {
    throw new ToolError(`Параметр path должен быть абсолютным путём файла или каталога, получено "${rawPath}".`);
  }
  const target = path.resolve(expanded);
  const extension = path.extname(target).toLowerCase();
  const isDirectory = /[\\/]$/.test(expanded) || extension === "" || Boolean((await statOf(target))?.isDirectory());
  if (isDirectory) return { directory: target };
  if (EXTENSIONS[format].includes(extension)) return { file: target };
  throw new ToolError(
    `Расширение ${extension} не подходит формату ${format}: ожидается ${EXTENSIONS[format].join(" или ")}. ` +
      "Если это каталог, добавь в конец пути слэш.",
  );
}

export async function refuseExisting(target, overwrite) {
  if (target.file && !overwrite && (await statOf(target.file))) throw alreadyExists(target.file);
}

function targetFile(target, filename) {
  if (target.file) return target.file;
  const name = typeof filename === "string" ? path.basename(filename.replaceAll("\\", "/")) : "";
  if (!name || name === "." || name === "..") {
    throw new ToolError("Редактор не вернул имя файла: укажи в path полный путь файла, а не каталог.");
  }
  return path.join(target.directory, name);
}

async function writeBytes(file, bytes, overwrite) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true }).catch((error) => {
    throw new ToolError(`Каталог ${directory} не создан: ${error.code ?? error.message}.`);
  });
  await writeFile(file, bytes, { flag: overwrite ? "w" : "wx" }).catch((error) => {
    throw error.code === "EEXIST"
      ? alreadyExists(file)
      : new ToolError(`Файл ${file} не записан: ${error.code ?? error.message}.`);
  });
}

export async function saveExport({ target, exported, overwrite }) {
  if (typeof exported?.dataBase64 !== "string" || !exported.dataBase64) {
    throw new ToolError("Операция export не вернула dataBase64: файл не записан.");
  }
  const file = targetFile(target, exported.filename);
  const bytes = Buffer.from(exported.dataBase64, "base64");
  await writeBytes(file, bytes, overwrite);
  return { path: file, bytes: bytes.length, mime: exported.mime, filename: exported.filename };
}
