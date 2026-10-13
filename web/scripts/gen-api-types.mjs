/**
 * Генерирует src/types/api.generated.ts из OpenAPI-схемы FastAPI.
 *
 * Схема берётся офлайн — `python -m scripts.export_openapi_schema` импортирует
 * приложение напрямую, поднятый стек не нужен (важно для CI). Если локально нет
 * питон-окружения с зависимостями backend, схему отдаёт контейнер cad-studio-app.
 *
 *   npm run gen:api          — перегенерировать типы
 *   npm run gen:api -- --check  — упасть, если файл разошёлся со схемой
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(webDir, "..", "backend");
const outFile = join(webDir, "src", "types", "api.generated.ts");
const check = process.argv.includes("--check");

const HEADER = `/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать руками.
 * Источник: OpenAPI-схема FastAPI. Обновить: npm run gen:api
 */
`;

function schemaFromPython() {
  return execFileSync("python", ["-m", "scripts.export_openapi_schema"], {
    cwd: backendDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function schemaFromDocker() {
  return execFileSync(
    "docker",
    ["exec", "cad-studio-app", "python", "-m", "scripts.export_openapi_schema"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
}

function loadSchema() {
  // В CI схему обычно уже выгрузила питон-джоба — берём файл, а не окружение.
  const preexported = process.env.OPENAPI_SCHEMA;
  if (preexported) return readFileSync(preexported, "utf8");

  const errors = [];
  for (const [name, fn] of [
    ["python", schemaFromPython],
    ["docker", schemaFromDocker],
  ]) {
    try {
      return fn();
    } catch (err) {
      errors.push(`${name}: ${err.message.split("\n")[0]}`);
    }
  }
  throw new Error(
    `Не удалось получить OpenAPI-схему.\n${errors.join("\n")}\n` +
      "Нужно либо питон-окружение backend, либо поднятый контейнер cad-studio-app (make up), " +
      "либо путь к готовой схеме в OPENAPI_SCHEMA.",
  );
}

const dir = mkdtempSync(join(tmpdir(), "cad-openapi-"));
const schemaPath = join(dir, "openapi.json");

try {
  writeFileSync(schemaPath, loadSchema());

  const generated = execFileSync(
    process.execPath,
    [join(webDir, "node_modules", "openapi-typescript", "bin", "cli.js"), schemaPath],
    { cwd: webDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const next = HEADER + generated;

  if (check) {
    const current = readFileSync(outFile, "utf8");
    if (current !== next) {
      console.error(
        `${outFile} разошёлся с OpenAPI-схемой backend. Выполните: npm run gen:api`,
      );
      process.exit(1);
    }
    console.log("api.generated.ts соответствует схеме backend");
  } else {
    writeFileSync(outFile, next);
    console.log(`Записано: ${outFile}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
