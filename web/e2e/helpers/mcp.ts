import { expect, request } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { jsonOf, startMcp, textOf } from "../../mcp/test/support/mcp-client.mjs";
import type { Feature, Topo } from "./control";

export const MCP_BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const EMAIL = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const PASSWORD = process.env.E2E_USER_PASSWORD || "testpass123";
const PRODUCTION_HOST = /(^|\.)krometra\.ru$/i;
const RETRY_CODES = new Set(["busy", "not_ready"]);
const RETRY_DEADLINE_MS = 60_000;
const RETRY_PAUSE_MS = 1_000;
const EDITOR_TIMEOUT_MS = "120000";

export interface ToolResult {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
}

export interface ChannelReply<T = any> {
  ok: boolean;
  op: string;
  result: T;
  error?: { code: string; message: string };
}

export interface MeshStats {
  bodyId: string;
  bbox: { min: number[]; max: number[] };
  vertices: number;
  triangles: number;
  openEdges: number;
  zLevels: number[];
}

export interface EditorState {
  document: { version: number };
  bodies: { id: string; visible: boolean }[];
  sketches: { id: string; used: boolean }[];
  timeline: { id: string; kind: string; params: Record<string, unknown>; bodyId: string | null }[];
  busy: boolean;
}

export function refuseProduction(baseUrl: string) {
  if (PRODUCTION_HOST.test(new URL(baseUrl).hostname)) {
    throw new Error(`e2e MCP не запускается против прода (${baseUrl}): задай E2E_BASE_URL локального стека.`);
  }
}

export function expectLevels(actual: number[], expected: number[], message: string) {
  expect(actual.length, `${message}: ${JSON.stringify(actual)}`).toBe(expected.length);
  expected.forEach((level, index) => expect(actual[index], `${message}: ${JSON.stringify(actual)}`).toBeCloseTo(level, 2));
}

export function topFace(topo: Topo, z: number) {
  const face = topo.faces.find((candidate) => candidate.planar && candidate.normal?.[2] === 1 && Math.abs(candidate.bbox!.min[2] - z) < 1e-3);
  expect(face, `плоская грань с нормалью +Z на высоте ${z}`).toBeTruthy();
  return face!;
}

export class McpCad {
  readonly projectIds: string[] = [];
  private constructor(private readonly mcp: ReturnType<typeof startMcp>) {}

  static start(): McpCad {
    refuseProduction(MCP_BASE_URL);
    return new McpCad(
      startMcp({
        CAD_STUDIO_URL: MCP_BASE_URL,
        CAD_STUDIO_API_KEY: "",
        CAD_STUDIO_EMAIL: EMAIL,
        CAD_STUDIO_PASSWORD: PASSWORD,
        CAD_STUDIO_READY_TIMEOUT_MS: EDITOR_TIMEOUT_MS,
        CAD_STUDIO_REQUEST_TIMEOUT_MS: EDITOR_TIMEOUT_MS,
      }),
    );
  }

  async tool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const result = (await this.mcp.callTool(name, args)) as ToolResult;
    expect(result.isError, `${name}: ${textOf(result)} ${textOf(result, 1)}`).not.toBe(true);
    return result;
  }

  async json<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return jsonOf(await this.tool(name, args)) as T;
  }

  async reply<T = any>(op: string, params?: Record<string, unknown>): Promise<ChannelReply<T>> {
    const deadline = Date.now() + RETRY_DEADLINE_MS;
    for (;;) {
      const result = (await this.mcp.callTool("cad_request", params === undefined ? { op } : { op, params })) as ToolResult;
      const reply = jsonOf(result) as ChannelReply<T>;
      if (reply.ok || !RETRY_CODES.has(reply.error!.code) || Date.now() > deadline) return reply;
      await delay(RETRY_PAUSE_MS);
    }
  }

  async op<T = any>(op: string, params?: Record<string, unknown>): Promise<T> {
    const reply = await this.reply<T>(op, params);
    expect(reply.ok, `${op}: ${JSON.stringify(reply.error)}`).toBe(true);
    return reply.result;
  }

  async openNewProject(name: string) {
    const project = await this.json<{ id: string; name: string }>("cad_create_project", {
      name: `${name}-${Date.now()}`,
      description: "e2e MCP, удаляется после прогона",
    });
    this.projectIds.push(project.id);
    const opened = await this.json<{ project: { id: string }; url: string; channelVersion: number }>("cad_open_project", {
      project_id: project.id,
    });
    expect(opened.project.id).toBe(project.id);
    expect(opened.url.startsWith(`${MCP_BASE_URL.replace(/\/+$/, "")}/editor/`), opened.url).toBe(true);
    expect(opened.channelVersion).toBe(1);
    return project.id;
  }

  async sketch(params: Record<string, unknown>) {
    return this.op<{ sketchId: string; entityCount: number; mode: string }>("sketch.create", params);
  }

  async extrude(params: Record<string, unknown>) {
    return (await this.op<Feature>("extrude", params)).feature;
  }

  stats(bodyId: string) {
    return this.op<MeshStats>("mesh.stats", { bodyId });
  }

  topology(bodyId: string) {
    return this.op<Topo>("topology", { bodyId });
  }

  state() {
    return this.json<EditorState>("cad_state");
  }

  async stop() {
    await this.mcp.stop();
    await deleteProjects(this.projectIds.splice(0));
  }
}

async function deleteProjects(ids: string[]) {
  if (!ids.length) return;
  const api = await request.newContext({ baseURL: MCP_BASE_URL });
  try {
    const login = await api.post("/api/auth/token", { form: { grant_type: "password", username: EMAIL, password: PASSWORD } });
    expect(login.ok(), `вход e2e-пользователя для уборки: ${login.status()}`).toBe(true);
    const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
    for (const id of ids) {
      const response = await api.delete(`/api/projects/${id}`, { headers });
      expect([200, 204, 404], `удаление проекта ${id}`).toContain(response.status());
    }
  } finally {
    await api.dispose();
  }
}
