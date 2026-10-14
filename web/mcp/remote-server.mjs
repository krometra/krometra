import { createRedactor } from "./errors.mjs";
import { startRemoteServer } from "./remote/server.mjs";

function positiveInt(raw, fallback) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const config = {
  port: positiveInt(process.env.MCP_PORT, 8787),
  backendUrl: (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, ""),
  publicUrl: (process.env.PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, ""),
  openTimeoutMs: positiveInt(process.env.MCP_OPEN_TIMEOUT_MS, 60_000),
  requestTimeoutMs: positiveInt(process.env.MCP_REQUEST_TIMEOUT_MS, 120_000),
};

const redactor = createRedactor();
const log = (...parts) => console.error("[krometra-mcp]", redactor.redact(parts.join(" ")));

const server = await startRemoteServer(config, log);
log(`listening on :${server.port}, backend ${config.backendUrl}, public ${config.publicUrl}`);

async function shutdown() {
  await server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
