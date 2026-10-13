import { setTimeout as delay } from "node:timers/promises";
import { ToolError } from "./errors.mjs";
import { collectAnchors, formatLegend, normalizeProjection, planLabels, sameProjection } from "./labels.mjs";
import { readPngSize } from "./png.mjs";

const STABILITY_ATTEMPTS = 3;
const SETTLE_MS = 250;
const PNG_MIME = "image/png";
const KIND_NAMES = { edges: "рёбер", faces: "граней" };
const COLORS = { accent: "#ff3b6b", background: "#111418", text: "#ffffff" };

async function drawMarks({ dataBase64, marks, style }) {
  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  ctx.lineWidth = style.lineWidth;
  ctx.strokeStyle = style.accent;
  for (const { anchor, box } of marks) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(box.x + box.width / 2, box.y + box.height / 2);
    ctx.stroke();
  }
  ctx.font = style.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { text, box } of marks) {
    ctx.fillStyle = style.background;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
    ctx.fillStyle = style.text;
    ctx.fillText(text, box.x + box.width / 2, box.y + box.height / 2, box.width - style.padding);
  }
  ctx.fillStyle = style.accent;
  for (const { anchor } of marks) {
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, style.dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL("image/png").split(",")[1];
}

function markStyle(metrics) {
  return {
    ...COLORS,
    font: `600 ${metrics.fontSize}px ui-monospace, Menlo, Consolas, monospace`,
    padding: metrics.padding,
    dotRadius: metrics.dotRadius,
    lineWidth: Math.max(1, Math.round(metrics.fontSize / 12)),
  };
}

export async function captureViewport(editor) {
  const shot = await editor.query("viewport.capture");
  if (typeof shot?.dataBase64 !== "string" || !shot.dataBase64) {
    throw new ToolError("viewport.capture не вернул dataBase64.");
  }
  return { mime: shot.mime ?? PNG_MIME, dataBase64: shot.dataBase64 };
}

async function project(editor, points) {
  return normalizeProjection(await editor.query("viewport.project", { points }), points.length);
}

async function captureWithProjection(editor, points) {
  for (let attempt = 1; ; attempt += 1) {
    const before = await project(editor, points);
    const shot = await captureViewport(editor);
    const projection = await project(editor, points);
    const stable = sameProjection(before, projection);
    if (stable || attempt === STABILITY_ATTEMPTS) return { shot, projection, stable };
    await delay(SETTLE_MS);
  }
}

function describeBody(body) {
  return `${body.id} (${body.name}${body.visible ? "" : ", скрыто"})`;
}

async function resolveBodyId(editor, requested) {
  if (requested) return requested;
  const { bodies = [] } = await editor.query("state");
  const visible = bodies.filter((body) => body.visible);
  if (visible.length === 1) return visible[0].id;
  throw new ToolError(
    `Укажи body_id: видимых тел ${visible.length}. Тела проекта: ${bodies.map(describeBody).join(", ") || "нет"}.`,
  );
}

export async function captureLabeled(editor, { kind, bodyId, labelText }) {
  const body = await resolveBodyId(editor, bodyId);
  const { anchors, unplaced } = collectAnchors(await editor.query("topology", { bodyId: body }), kind);
  if (!anchors.length) {
    throw new ToolError(`У тела ${body} нет ${KIND_NAMES[kind]} для подписи: сними вьюпорт без подписей.`);
  }
  const { shot, projection, stable } = await captureWithProjection(
    editor,
    anchors.map((anchor) => anchor.point),
  );
  const image = readPngSize(shot.dataBase64);
  if (!image) throw new ToolError(`viewport.capture вернул не PNG (${shot.mime}): подписи наносятся только на PNG.`);
  const plan = planLabels({ anchors, projection, image, labelText });
  const dataBase64 = await editor.evaluate("подписи на снимке", drawMarks, {
    dataBase64: shot.dataBase64,
    marks: plan.marks,
    style: markStyle(plan.metrics),
  });
  return {
    shot: { mime: PNG_MIME, dataBase64 },
    legend: formatLegend({ bodyId: body, kind, image, plan, unplaced, stable }),
  };
}
