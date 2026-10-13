import { describeParams, isPlainObject, parseParams, type ParamSchema, type ParamsOf } from "./params";
import {
  CONTROL_VERSION,
  ControlError,
  fail,
  type ControlCapabilities,
  type ControlErrorCode,
  type ControlOpDescriptor,
  type ControlReply,
} from "./protocol";

export interface ControlOp {
  descriptor: ControlOpDescriptor;
  needsReady: boolean;
  prepare(rawParams: unknown): () => unknown;
}

export interface OpDefinition<S extends ParamSchema> {
  op: string;
  description: string;
  mutates?: boolean;
  needsReady?: boolean;
  params?: S;
  run(params: ParamsOf<S>): unknown;
}

export interface DispatcherHooks {
  notReadyReason?: () => string | null;
  busyReason?: () => string | null;
}

export function defineOp<S extends ParamSchema = Record<string, never>>(definition: OpDefinition<S>): ControlOp {
  const schema = (definition.params ?? {}) as S;
  return {
    descriptor: {
      op: definition.op,
      description: definition.description,
      mutates: definition.mutates ?? false,
      params: describeParams(schema),
    },
    needsReady: definition.needsReady ?? true,
    prepare(rawParams) {
      const params = parseParams(schema, rawParams);
      return () => definition.run(params);
    },
  };
}

function toJson(value: unknown): unknown {
  const text = JSON.stringify(value);
  return text === undefined ? null : JSON.parse(text);
}

function toError(error: unknown): { code: ControlErrorCode; message: string } {
  if (error instanceof ControlError) return { code: error.code, message: error.message };
  if (error instanceof Error && error.message) return { code: "operation_failed", message: error.message };
  return { code: "operation_failed", message: typeof error === "string" && error ? error : "Операция завершилась ошибкой." };
}

function requestedOp(req: unknown): string {
  if (isPlainObject(req) && typeof req.op === "string" && req.op.length > 0) return req.op;
  throw fail("invalid_params", "Запрос должен быть объектом { op: string, params?: object }.");
}

export function createControlDispatcher(hooks: DispatcherHooks = {}) {
  const ops = new Map<string, ControlOp>();
  let running: string | null = null;
  let readyAnnounced = false;
  let announceReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    announceReady = resolve;
  });

  function register(list: ControlOp[]) {
    for (const op of list) {
      const name = op.descriptor.op;
      if (ops.has(name)) throw new Error(`Операция канала «${name}» зарегистрирована дважды.`);
      ops.set(name, op);
    }
  }

  function capabilities(): ControlCapabilities {
    return { version: CONTROL_VERSION, ops: [...ops.values()].map((op) => op.descriptor) };
  }

  function markReady(): boolean {
    if (readyAnnounced) return false;
    readyAnnounced = true;
    announceReady();
    return true;
  }

  function notReadyReason(): string | null {
    if (hooks.notReadyReason) return hooks.notReadyReason();
    return readyAnnounced ? null : "Редактор ещё не готов.";
  }

  function busyReason(): string | null {
    if (running) return `Выполняется операция «${running}».`;
    return hooks.busyReason?.() ?? null;
  }

  async function execute(name: string, op: ControlOp, rawParams: unknown): Promise<unknown> {
    const run = op.prepare(rawParams);
    if (op.needsReady) {
      const reason = notReadyReason();
      if (reason) throw fail("not_ready", reason);
    }
    if (!op.descriptor.mutates) return toJson(await run());

    const reason = busyReason();
    if (reason) throw fail("busy", reason);
    running = name;
    try {
      return toJson(await run());
    } finally {
      running = null;
    }
  }

  async function request(req: unknown): Promise<ControlReply> {
    let name = "";
    try {
      name = requestedOp(req);
      const op = ops.get(name);
      if (!op) throw fail("unknown_op", `Неизвестная операция «${name}». Список доступных — op "capabilities".`);
      const result = await execute(name, op, (req as { params?: unknown }).params);
      return { ok: true, op: name, result };
    } catch (error) {
      return { ok: false, op: name, error: toError(error) };
    }
  }

  register([
    defineOp({
      op: "capabilities",
      description:
        "Список операций канала: имя, описание, признак изменения модели и параметры каждой. Возвращает { version, ops: [{ op, description, mutates, params: { имя: { type, required, description } } }] }.",
      needsReady: false,
      run: capabilities,
    }),
  ]);

  return { ready, markReady, register, request, capabilities, busyReason, notReadyReason };
}
