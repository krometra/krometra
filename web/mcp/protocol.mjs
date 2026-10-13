import { ToolError } from "./errors.mjs";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const rpcError = (code, message) => Object.assign(new Error(message), { code });

export function createProtocol({ serverInfo, instructions, tools, redact, log }) {
  const toolsByName = new Map(tools.map((tool) => [tool.def.name, tool]));

  function redactContent(result) {
    const content = result.content.map((block) =>
      block.type === "text" ? { ...block, text: redact(block.text) } : block,
    );
    return { ...result, content };
  }

  async function callTool({ name, arguments: args } = {}) {
    const tool = toolsByName.get(name);
    if (!tool) throw rpcError(INVALID_PARAMS, `Unknown tool: ${name}`);
    try {
      return redactContent(await tool.handler(args ?? {}));
    } catch (error) {
      if (!(error instanceof ToolError)) log(error.stack ?? error);
      return redactContent({ content: [{ type: "text", text: String(error.message ?? error) }], isError: true });
    }
  }

  function initialize(params) {
    const requested = params?.protocolVersion;
    return {
      protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      instructions,
    };
  }

  const methods = {
    initialize,
    ping: () => ({}),
    "tools/list": () => ({ tools: tools.map((tool) => tool.def) }),
    "tools/call": callTool,
  };

  return async function handle({ id, method, params } = {}) {
    if (typeof method !== "string" || method.startsWith("notifications/")) return null;
    const isRequest = id !== undefined && id !== null;
    try {
      if (!Object.hasOwn(methods, method)) throw rpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
      const result = await methods[method](params);
      return isRequest ? { jsonrpc: "2.0", id, result } : null;
    } catch (error) {
      return isRequest
        ? { jsonrpc: "2.0", id, error: { code: error.code ?? INTERNAL_ERROR, message: redact(error.message) } }
        : null;
    }
  };
}
