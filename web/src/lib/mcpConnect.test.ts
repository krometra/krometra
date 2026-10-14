import { describe, expect, it } from "vitest";
import { MCP_SERVER_NAME, REMOVE_COMMAND, connectCommand, shellQuote } from "./mcpConnect";

describe("кавычки для shell", () => {
  it("безопасные слова не трогает", () => {
    expect(shellQuote("CAD_STUDIO_URL=https://krometra.ru")).toBe("CAD_STUDIO_URL=https://krometra.ru");
    expect(shellQuote("CAD_STUDIO_API_KEY=krm_Ab-9_z")).toBe("CAD_STUDIO_API_KEY=krm_Ab-9_z");
  });

  it("остальное берёт в одинарные кавычки и экранирует апостроф", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("$(rm -rf ~)")).toBe("'$(rm -rf ~)'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe("команда подключения к Claude Code", () => {
  const command = connectCommand("https://krometra.ru", "krm_Ab-9_zXy");

  it("подставляет адрес сайта и ключ и регистрирует сервер для всех проектов пользователя", () => {
    expect(command).toContain(`claude mcp add ${MCP_SERVER_NAME} -s user`);
    expect(command).toContain("-e CAD_STUDIO_URL=https://krometra.ru");
    expect(command).toContain("-e CAD_STUDIO_API_KEY=krm_Ab-9_zXy");
  });

  it("запускает сервер полным путём к node и отделяет его от опций через --", () => {
    expect(command).toMatch(/ -- "\$\(command -v node\)" "\$HOME\/krometra\/web\/mcp\/server\.mjs"$/);
  });

  it("переносы строк продолжаются обратным слэшем, чтобы команду можно было вставить целиком", () => {
    const lines = command.split("\n");
    expect(lines.slice(0, -1).every((line) => line.endsWith(" \\"))).toBe(true);
  });

  it("удаление сервера ссылается на то же имя и область", () => {
    expect(REMOVE_COMMAND).toBe(`claude mcp remove ${MCP_SERVER_NAME} -s user`);
  });
});
