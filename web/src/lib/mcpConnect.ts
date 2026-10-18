export const MCP_SERVER_NAME = "krometra";
export const MCP_REPO_URL = "https://github.com/krometra/krometra";
export const MCP_README_URL = `${MCP_REPO_URL}/blob/master/web/mcp/README.md`;
export const API_KEY_PLACEHOLDER = "krm_...";

const CHECKOUT_DIR = "~/krometra";
const SERVER_ENTRY = '"$HOME/krometra/web/mcp/server.mjs"';
const SAFE_SHELL_WORD = /^[\w@%+=:,./-]+$/;

export function shellQuote(value: string): string {
  return SAFE_SHELL_WORD.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

export const INSTALL_COMMAND = [
  `git clone ${MCP_REPO_URL}.git ${CHECKOUT_DIR}`,
  `cd ${CHECKOUT_DIR}/web && npm install`,
  "npx playwright install chromium",
].join("\n");

export const VERIFY_COMMAND = "claude mcp list";

export const REMOVE_COMMAND = `claude mcp remove ${MCP_SERVER_NAME} -s user`;

export function mcpEndpoint(origin: string): string {
  return `${origin}/mcp`;
}

export function connectCommand(origin: string, apiKey: string): string {
  return [
    `claude mcp add ${MCP_SERVER_NAME} -s user --transport http ${shellQuote(mcpEndpoint(origin))}`,
    `  --header ${shellQuote(`Authorization: Bearer ${apiKey}`)}`,
  ].join(" \\\n");
}

export function localConnectCommand(origin: string, apiKey: string): string {
  return [
    `claude mcp add ${MCP_SERVER_NAME} -s user`,
    `  -e ${shellQuote(`CAD_STUDIO_URL=${origin}`)}`,
    `  -e ${shellQuote(`CAD_STUDIO_API_KEY=${apiKey}`)}`,
    `  -- "$(command -v node)" ${SERVER_ENTRY}`,
  ].join(" \\\n");
}
