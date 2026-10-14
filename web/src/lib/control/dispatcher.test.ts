import { describe, expect, it, vi } from "vitest";
import { ApiError, SAVE_FAILED_MESSAGE, saveFailure } from "../apiError";
import { createControlDispatcher, defineOp, type DispatcherHooks } from "./dispatcher";
import { param } from "./params";
import { fail, type ControlReply } from "./protocol";

function deferred<T = void>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function errorOf(reply: ControlReply) {
  if (reply.ok) throw new Error(`ожидалась ошибка, пришло ${JSON.stringify(reply.result)}`);
  return reply.error;
}

function resultOf(reply: ControlReply) {
  if (!reply.ok) throw new Error(`ожидался результат, пришло ${reply.error.code}: ${reply.error.message}`);
  return reply.result;
}

function readyDispatcher(hooks: DispatcherHooks = {}) {
  const dispatcher = createControlDispatcher(hooks);
  dispatcher.markReady();
  return dispatcher;
}

describe("createControlDispatcher: разбор запроса", () => {
  it("выполняет зарегистрированную операцию и возвращает её имя", async () => {
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({
        op: "sum",
        description: "Сумма.",
        params: { a: param.number("A."), b: param.number("B.") },
        run: ({ a, b }) => ({ total: a + b }),
      }),
    ]);
    expect(await dispatcher.request({ op: "sum", params: { a: 2, b: 3 } })).toEqual({
      ok: true,
      op: "sum",
      result: { total: 5 },
    });
  });

  it("неизвестная операция даёт unknown_op", async () => {
    const reply = await readyDispatcher().request({ op: "teleport" });
    expect(reply.op).toBe("teleport");
    expect(errorOf(reply).code).toBe("unknown_op");
  });

  it("запрос не того вида даёт invalid_params и не отклоняет промис", async () => {
    const dispatcher = readyDispatcher();
    for (const broken of [null, undefined, 42, "state", [], {}, { op: 5 }, { op: "" }]) {
      const reply = await dispatcher.request(broken);
      expect(reply.op).toBe("");
      expect(errorOf(reply).code).toBe("invalid_params");
    }
  });

  it("неверные параметры отклоняются до запуска обработчика", async () => {
    const run = vi.fn();
    const dispatcher = readyDispatcher();
    dispatcher.register([defineOp({ op: "move", description: "Сдвиг.", params: { to: param.vec3("Куда.") }, run })]);
    expect(errorOf(await dispatcher.request({ op: "move", params: { to: [1, 2] } })).code).toBe("invalid_params");
    expect(errorOf(await dispatcher.request({ op: "move", params: [1, 2, 3] })).code).toBe("invalid_params");
    expect(run).not.toHaveBeenCalled();
  });

  it("операция без параметров не принимает лишних", async () => {
    const dispatcher = readyDispatcher();
    dispatcher.register([defineOp({ op: "ping", description: "Проверка.", run: () => "pong" })]);
    expect(resultOf(await dispatcher.request({ op: "ping" }))).toBe("pong");
    expect(resultOf(await dispatcher.request({ op: "ping", params: {} }))).toBe("pong");
    expect(errorOf(await dispatcher.request({ op: "ping", params: { loud: true } })).code).toBe("invalid_params");
  });

  it("повторная регистрация имени — ошибка сборки, а не тихая подмена", () => {
    const dispatcher = createControlDispatcher();
    const op = defineOp({ op: "ping", description: "Проверка.", run: () => null });
    dispatcher.register([op]);
    expect(() => dispatcher.register([op])).toThrow(/ping/);
  });
});

describe("createControlDispatcher: ошибки обработчика", () => {
  it("ControlError сохраняет свой код", async () => {
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({
        op: "find",
        description: "Поиск.",
        run: () => {
          throw fail("not_found", "Тело не найдено.");
        },
      }),
    ]);
    expect(errorOf(await dispatcher.request({ op: "find" }))).toEqual({ code: "not_found", message: "Тело не найдено." });
  });

  it("любое другое исключение и отклонённый промис становятся operation_failed", async () => {
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({
        op: "throw",
        description: "Бросает.",
        run: () => {
          throw new Error("ядро упало");
        },
      }),
      defineOp({ op: "reject", description: "Отклоняет.", run: () => Promise.reject("строка вместо ошибки") }),
      defineOp({ op: "silent", description: "Отклоняет без текста.", run: () => Promise.reject(undefined) }),
    ]);
    expect(errorOf(await dispatcher.request({ op: "throw" }))).toEqual({ code: "operation_failed", message: "ядро упало" });
    expect(errorOf(await dispatcher.request({ op: "reject" })).message).toBe("строка вместо ошибки");
    expect(errorOf(await dispatcher.request({ op: "silent" })).message.length).toBeGreaterThan(0);
  });

  it("сбой сохранения на сервере даёт save_failed, а не operation_failed", async () => {
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({ op: "save", description: "Не сохраняет.", run: () => Promise.reject(saveFailure(new ApiError(502, "error", "502"))) }),
    ]);
    expect(errorOf(await dispatcher.request({ op: "save" }))).toEqual({ code: "save_failed", message: SAVE_FAILED_MESSAGE });
  });

  it("результат приводится к JSON: undefined становится null, несериализуемое — ошибкой", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({ op: "nothing", description: "Пусто.", run: () => undefined }),
      defineOp({ op: "mixed", description: "Смешанное.", run: () => ({ keep: 1, drop: undefined, fn: () => 1, nan: Number.NaN }) }),
      defineOp({ op: "cyclic", description: "Цикл.", run: () => cyclic }),
    ]);
    expect(resultOf(await dispatcher.request({ op: "nothing" }))).toBeNull();
    expect(resultOf(await dispatcher.request({ op: "mixed" }))).toEqual({ keep: 1, nan: null });
    expect(errorOf(await dispatcher.request({ op: "cyclic" })).code).toBe("operation_failed");
  });
});

describe("createControlDispatcher: готовность", () => {
  it("до готовности операции редактора отвечают not_ready, а capabilities доступен", async () => {
    const dispatcher = createControlDispatcher();
    dispatcher.register([
      defineOp({ op: "topology", description: "Топология.", run: () => 1 }),
      defineOp({ op: "state", description: "Состояние.", needsReady: false, run: () => "loading" }),
    ]);
    expect(errorOf(await dispatcher.request({ op: "topology" })).code).toBe("not_ready");
    expect(resultOf(await dispatcher.request({ op: "state" }))).toBe("loading");
    expect((await dispatcher.request({ op: "capabilities" })).ok).toBe(true);

    dispatcher.markReady();
    expect(resultOf(await dispatcher.request({ op: "topology" }))).toBe(1);
  });

  it("ready разрешается один раз, markReady сообщает о первом вызове", async () => {
    const dispatcher = createControlDispatcher();
    let resolved = false;
    void dispatcher.ready.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    expect(dispatcher.markReady()).toBe(true);
    expect(dispatcher.markReady()).toBe(false);
    await dispatcher.ready;
    expect(resolved).toBe(true);
  });

  it("причина неготовности от редактора попадает в сообщение и может вернуться после готовности", async () => {
    let reason: string | null = "Браузерное ядро перезапускается.";
    const dispatcher = createControlDispatcher({ notReadyReason: () => reason });
    dispatcher.register([defineOp({ op: "topology", description: "Топология.", run: () => 1 })]);
    dispatcher.markReady();
    expect(errorOf(await dispatcher.request({ op: "topology" }))).toEqual({
      code: "not_ready",
      message: "Браузерное ядро перезапускается.",
    });
    reason = null;
    expect((await dispatcher.request({ op: "topology" })).ok).toBe(true);
  });

  it("неверные параметры сообщаются раньше неготовности", async () => {
    const dispatcher = createControlDispatcher();
    dispatcher.register([defineOp({ op: "topology", description: "Топология.", params: { bodyId: param.id("Тело.") }, run: () => 1 })]);
    expect(errorOf(await dispatcher.request({ op: "topology" })).code).toBe("invalid_params");
  });
});

describe("createControlDispatcher: мутирующие операции по одной", () => {
  function withSlowMutation(hooks: DispatcherHooks = {}) {
    const gate = deferred<string>();
    const started = vi.fn();
    const dispatcher = readyDispatcher(hooks);
    dispatcher.register([
      defineOp({
        op: "extrude",
        description: "Выдавить.",
        mutates: true,
        run: () => {
          started();
          return gate.promise;
        },
      }),
      defineOp({ op: "fillet", description: "Скруглить.", mutates: true, run: () => "filleted" }),
      defineOp({ op: "state", description: "Состояние.", run: () => ({ busy: dispatcher.busyReason() !== null }) }),
    ]);
    return { dispatcher, gate, started };
  }

  it("вторая мутирующая во время первой получает busy, чтение проходит", async () => {
    const { dispatcher, gate, started } = withSlowMutation();
    const first = dispatcher.request({ op: "extrude" });
    await Promise.resolve();
    expect(started).toHaveBeenCalledTimes(1);

    const second = await dispatcher.request({ op: "fillet" });
    expect(errorOf(second).code).toBe("busy");
    expect(errorOf(second).message).toContain("extrude");
    expect(errorOf(await dispatcher.request({ op: "extrude" })).code).toBe("busy");
    expect(started).toHaveBeenCalledTimes(1);
    expect(resultOf(await dispatcher.request({ op: "state" }))).toEqual({ busy: true });

    gate.resolve("body-1");
    expect(resultOf(await first)).toBe("body-1");
    expect(resultOf(await dispatcher.request({ op: "state" }))).toEqual({ busy: false });
    expect(resultOf(await dispatcher.request({ op: "fillet" }))).toBe("filleted");
  });

  it("упавшая мутирующая операция освобождает канал", async () => {
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({
        op: "extrude",
        description: "Выдавить.",
        mutates: true,
        run: () => Promise.reject(new Error("профиль не замкнут")),
      }),
      defineOp({ op: "fillet", description: "Скруглить.", mutates: true, run: () => "filleted" }),
    ]);
    expect(errorOf(await dispatcher.request({ op: "extrude" })).message).toBe("профиль не замкнут");
    expect(dispatcher.busyReason()).toBeNull();
    expect(resultOf(await dispatcher.request({ op: "fillet" }))).toBe("filleted");
  });

  it("занятость самого редактора тоже отклоняет мутирующую операцию, но не чтение", async () => {
    let editorBusy: string | null = "Идёт выдавливание из интерфейса.";
    const { dispatcher, started } = withSlowMutation({ busyReason: () => editorBusy });
    expect(errorOf(await dispatcher.request({ op: "extrude" }))).toEqual({
      code: "busy",
      message: "Идёт выдавливание из интерфейса.",
    });
    expect(started).not.toHaveBeenCalled();
    expect(resultOf(await dispatcher.request({ op: "state" }))).toEqual({ busy: true });

    editorBusy = null;
    expect(resultOf(await dispatcher.request({ op: "fillet" }))).toBe("filleted");
  });

  it("параллельные операции чтения друг другу не мешают", async () => {
    const gate = deferred<number>();
    const dispatcher = readyDispatcher();
    dispatcher.register([
      defineOp({ op: "slow", description: "Долгое чтение.", run: () => gate.promise }),
      defineOp({ op: "fast", description: "Быстрое чтение.", run: () => 2 }),
    ]);
    const slow = dispatcher.request({ op: "slow" });
    expect(resultOf(await dispatcher.request({ op: "fast" }))).toBe(2);
    gate.resolve(1);
    expect(resultOf(await slow)).toBe(1);
  });
});

describe("capabilities", () => {
  it("описывает операции в виде контракта и включает саму себя", async () => {
    const dispatcher = createControlDispatcher();
    dispatcher.register([
      defineOp({
        op: "fillet",
        description: "Скругляет рёбра тела.",
        mutates: true,
        params: {
          bodyId: param.id("Тело."),
          radius: param.number("Радиус, мм.", { above: 0 }),
          preview: param.optional(param.boolean("Только предпросмотр.")),
        },
        run: () => null,
      }),
    ]);
    const result = resultOf(await dispatcher.request({ op: "capabilities" })) as {
      version: number;
      ops: { op: string; mutates: boolean; description: string; params: Record<string, unknown> }[];
    };
    expect(result.version).toBe(1);
    expect(result.ops.map((op) => op.op)).toEqual(["capabilities", "fillet"]);
    expect(result.ops[0]).toMatchObject({ mutates: false, params: {} });
    expect(result.ops[1]).toEqual({
      op: "fillet",
      description: "Скругляет рёбра тела.",
      mutates: true,
      params: {
        bodyId: { type: "string", required: true, description: "Тело." },
        radius: { type: "number", required: true, description: "Радиус, мм." },
        preview: { type: "boolean", required: false, description: "Только предпросмотр." },
      },
    });
  });
});
