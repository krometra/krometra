import { BACKGROUND, BODY_ID, HOME_TARGET, boxTopology, projectPoint, stubExportFile } from "/model.mjs";

const READY_DELAY_MS = 300;
const MUTATION_MS = 400;
const DRIFT_MM = 5;
const RELOADED_FLAG = "stub-reloaded";

const { mode, project: projectId } = document.body.dataset;
const canvas = document.querySelector("#viewport");

const editor = {
  camera: { position: [120, -160, 110], target: [...HOME_TARGET] },
  bodies: [{ id: BODY_ID, name: "Тело 1", visible: true }],
  timeline: [{ id: "op-1", kind: "extrude", label: "Выдавливание 1", status: "ok", params: { distance: 20 } }],
  version: 1,
  busy: false,
  captures: 0,
  driftingCaptures: 0,
  exports: 0,
  exportName: null,
};

const describeOp = (op, description, mutates, params = {}) => ({ op, description, mutates, params });
const param = (type, required, description) => ({ type, required, description });

const CAPABILITIES = [
  describeOp("capabilities", "Список операций канала", false),
  describeOp("state", "Состояние редактора", false),
  describeOp("topology", "Грани и рёбра тела", false, { bodyId: param("string", true, "id тела") }),
  describeOp("camera.get", "Текущая камера", false),
  describeOp("camera.set", "Поставить камеру", false, {
    position: param("number[]", true, "мм"),
    target: param("number[]", false, "мм"),
  }),
  describeOp("viewport.project", "Проекция точек модели на страницу", false, {
    points: param("number[][]", true, "мм"),
  }),
  describeOp("viewport.capture", "Снимок вьюпорта", false),
  describeOp("sketch.get", "Открытый эскиз", false),
  describeOp("export", "Экспорт тел в файл", false, {
    format: param("string", true, "step | stl"),
    bodyIds: param("array", false, "id тел"),
  }),
  describeOp("stub.extrude", "Выдавить новое тело", true, { distance: param("number", true, "мм") }),
  describeOp("stub.fail", "Операция, которую ядро не выполняет", true),
];

class ControlFailure extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isPoint = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canvasRect() {
  const { left, top, width, height } = canvas.getBoundingClientRect();
  return { left, top, width, height };
}

function capture() {
  const context = canvas.getContext("2d");
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  editor.captures += 1;
  const dataBase64 = canvas.toDataURL("image/png").split(",")[1];
  if (editor.driftingCaptures > 0) {
    editor.driftingCaptures -= 1;
    editor.camera.target[0] += DRIFT_MM;
  }
  return { mime: "image/png", dataBase64, width: canvas.width, height: canvas.height };
}

async function mutate(change) {
  if (editor.busy) throw new ControlFailure("busy", "Выполняется другая операция");
  editor.busy = true;
  try {
    await pause(MUTATION_MS);
    return change();
  } finally {
    editor.busy = false;
  }
}

function extrude({ distance, visible = false }) {
  if (!Number.isFinite(distance)) throw new ControlFailure("invalid_params", "distance: ожидалось число");
  return mutate(() => {
    const body = { id: `body-${editor.bodies.length + 1}`, name: `Тело ${editor.bodies.length + 1}`, visible };
    editor.bodies.push(body);
    editor.version += 1;
    return { bodyId: body.id };
  });
}

function exportFile({ format, bodyIds }) {
  const file = stubExportFile(format, bodyIds);
  if (!file) throw new ControlFailure("invalid_params", "format: ожидалось step | stl");
  if (editor.busy) throw new ControlFailure("busy", "Выполняется другая операция");
  const missing = (bodyIds ?? []).filter((id) => !editor.bodies.some((body) => body.id === id));
  if (missing.length) throw new ControlFailure("not_found", `В документе нет тел: ${missing.join(", ")}`);
  editor.exports += 1;
  return {
    mime: file.mime,
    filename: editor.exportName ?? file.filename,
    dataBase64: btoa(String.fromCharCode(...file.bytes)),
  };
}

const OPS = {
  capabilities: () => ({ version: 1, ops: CAPABILITIES }),
  state: () => ({
    projectId,
    mode: "model",
    kernel: "ready",
    document: { version: editor.version, dirty: false },
    bodies: editor.bodies,
    sketches: [],
    timeline: editor.timeline,
    busy: editor.busy,
  }),
  topology: ({ bodyId }) => {
    if (typeof bodyId !== "string") throw new ControlFailure("invalid_params", "bodyId: ожидалась строка");
    if (bodyId !== BODY_ID) throw new ControlFailure("not_found", `Тело ${bodyId} не найдено`);
    return boxTopology();
  },
  "camera.get": () => editor.camera,
  "camera.set": ({ position, target = HOME_TARGET }) => {
    if (!isPoint(position) || !isPoint(target))
      throw new ControlFailure("invalid_params", "position: ожидалось [x, y, z]");
    editor.camera = { position, target: [...target] };
    return editor.camera;
  },
  "viewport.project": ({ points }) => {
    if (!Array.isArray(points) || !points.every(isPoint))
      throw new ControlFailure("invalid_params", "points: ожидалось [[x, y, z]]");
    const project = (point) => {
      const [x, y] = projectPoint(point, editor.camera.target);
      return { x, y, behind: false, inside: true };
    };
    return { points: points.map(project), canvas: canvasRect() };
  },
  "viewport.capture": capture,
  "sketch.get": () => {
    throw new ControlFailure("wrong_mode", "Эскиз не открыт");
  },
  "stub.extrude": extrude,
  "stub.fail": () =>
    mutate(() => {
      throw new ControlFailure("operation_failed", "Ядро не построило тело");
    }),
  "stub.drift": ({ captures }) => {
    editor.driftingCaptures = captures;
    return { driftingCaptures: captures };
  },
  export: exportFile,
  "stub.exportName": ({ filename }) => {
    editor.exportName = filename;
    return { filename };
  },
  "stub.stats": () => ({ captures: editor.captures, exports: editor.exports }),
};

async function request({ op, params = {} }) {
  try {
    if (!Object.hasOwn(OPS, op)) throw new ControlFailure("unknown_op", `Неизвестная операция ${op}`);
    return { ok: true, op, result: await OPS[op](params) };
  } catch (error) {
    return { ok: false, op, error: { code: error.code ?? "operation_failed", message: error.message } };
  }
}

function installChannel() {
  const ready = new Promise((resolve) => {
    if (mode === "never-ready") return;
    setTimeout(() => {
      resolve();
      window.dispatchEvent(new Event("cad-control-ready"));
    }, READY_DELAY_MS);
  });
  window.cadControl = { version: 1, ready, request };
}

function reloadBeforeReadyOnce() {
  if (mode !== "reload-once" || sessionStorage.getItem(RELOADED_FLAG)) return;
  sessionStorage.setItem(RELOADED_FLAG, "1");
  setTimeout(() => window.location.reload(), READY_DELAY_MS / 2);
}

const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
if (!refreshed.ok) window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
else if (mode !== "no-channel") {
  installChannel();
  reloadBeforeReadyOnce();
}
