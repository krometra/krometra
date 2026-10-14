import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { STUB_API_KEY } from "../stub/app.mjs";

const SERVER = fileURLToPath(new URL("../../server.mjs", import.meta.url));

export function startMcp(env) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      CAD_STUDIO_API_KEY: STUB_API_KEY,
      CAD_STUDIO_EMAIL: "",
      CAD_STUDIO_PASSWORD: "",
      CAD_STUDIO_HEADLESS: "1",
      CAD_STUDIO_READY_TIMEOUT_MS: "2500",
      CAD_STUDIO_REQUEST_TIMEOUT_MS: "10000",
      ...env,
    },
  });
  const pending = new Map();
  const stdout = [];
  const stderr = [];
  let nextId = 1;

  createInterface({ input: child.stdout }).on("line", (line) => {
    stdout.push(line);
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => stderr.push(chunk));
  const exited = new Promise((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  const writeLine = (line) => child.stdin.write(`${line}\n`);

  function rpc(method, params) {
    return new Promise((resolve) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, resolve);
      writeLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  function awaitUnmatched() {
    return new Promise((resolve) => {
      pending.set(null, resolve);
    });
  }

  return {
    rpc,
    notify: (method) => writeLine(JSON.stringify({ jsonrpc: "2.0", method })),
    sendRaw(line) {
      const reply = awaitUnmatched();
      writeLine(line);
      return reply;
    },
    async callTool(name, args = {}) {
      const { result, error } = await rpc("tools/call", { name, arguments: args });
      assert.equal(error, undefined, `tools/call ${name} вернул JSON-RPC error`);
      return result;
    },
    responses: () => stdout.map((line) => JSON.parse(line)),
    output: () => `${stdout.join("\n")}\n${stderr.join("")}`,
    stop() {
      child.stdin.end();
      return exited;
    },
  };
}

export function textOf(result, index = 0) {
  const blocks = result.content.filter((block) => block.type === "text");
  return blocks[index]?.text ?? "";
}

export function jsonOf(result, index = 0) {
  return JSON.parse(textOf(result, index));
}

export function imageOf(result) {
  const block = result.content.find((item) => item.type === "image");
  assert.ok(block, "в ответе нет image-контента");
  return block;
}
