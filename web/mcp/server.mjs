import { createInterface } from "node:readline";
import { loadConfig, missingCredentials } from "./config.mjs";
import { Editor } from "./editor.mjs";
import { createRedactor } from "./errors.mjs";
import { createProtocol } from "./protocol.mjs";
import { Session } from "./session.mjs";
import { createLocalFileTools } from "./localFiles.mjs";
import { INSTRUCTIONS, createTools } from "./tools.mjs";

const SERVER_INFO = { name: "krometra", version: "0.1.0" };
const PARSE_ERROR = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };

const config = loadConfig(process.env);
const redactor = createRedactor();
const log = (...parts) => console.error(`[${SERVER_INFO.name}]`, redactor.redact(parts.join(" ")));

const session = new Session(config, redactor);
const editor = new Editor(config, session, log);
const handle = createProtocol({
  serverInfo: SERVER_INFO,
  instructions: INSTRUCTIONS,
  tools: createTools({ session, editor, fileTools: createLocalFileTools({ editor }) }),
  redact: redactor.redact,
  log,
});

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

let closing = null;
function shutdown() {
  closing ??= Promise.allSettled([editor.close(), session.dispose()]).then(() => process.exit(0));
}

let inFlight = 0;
let inputClosed = false;
function shutdownWhenIdle() {
  if (inputClosed && inFlight === 0) shutdown();
}

function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function receive(line) {
  if (!line.trim()) return;
  const message = parse(line);
  if (!message) {
    send(PARSE_ERROR);
    return;
  }
  inFlight += 1;
  handle(message)
    .then((response) => response && send(response))
    .catch((error) => log(error.stack ?? error))
    .finally(() => {
      inFlight -= 1;
      shutdownWhenIdle();
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
process.on("unhandledRejection", (reason) => log("unhandled rejection:", reason?.stack ?? reason));
process.on("uncaughtException", (error) => log("uncaught exception:", error.stack ?? error));
process.stdout.on("error", shutdown);

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", receive);
input.on("close", () => {
  inputClosed = true;
  shutdownWhenIdle();
});

const missing = missingCredentials(config);
log(
  `started: ${config.baseUrl}, ${config.headless ? "headless" : "visible"} browser,`,
  missing.length ? `missing env ${missing.join(", ")}` : config.apiKey ? "login by api key" : `user ${config.email}`,
);
