import type { Point2, SectionContour } from "@/lib/sectionContours";

const PNG_PREFIX = "data:image/png;base64,";
const SECTION_SIZE = { width: 900, height: 700 };
const SECTION_MARGIN = 60;
const SECTION_PALETTE = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b", "#e377c2", "#17becf"];

export interface LabelMark {
  text: string;
  anchor: { x: number; y: number };
  box: { x: number; y: number; width: number; height: number };
}

export interface LabelStyle {
  accent: string;
  background: string;
  text: string;
  font: string;
  padding: number;
  dotRadius: number;
  lineWidth: number;
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не дал 2D-контекст для рисования.");
  return { canvas, ctx };
}

function pngBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png").slice(PNG_PREFIX.length);
}

export async function drawLabels(png: Uint8Array<ArrayBuffer>, marks: LabelMark[], style: LabelStyle): Promise<string> {
  const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
  const { canvas, ctx } = canvasOf(bitmap.width, bitmap.height);
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
  return pngBase64(canvas);
}

export interface SectionPicture {
  title: string;
  bodies: { name: string; contours: SectionContour[] }[];
}

export function drawSection(picture: SectionPicture): string | null {
  const points = picture.bodies.flatMap((body) => body.contours.flatMap((contour) => contour.points));
  if (points.length === 0) return null;
  const { width, height } = SECTION_SIZE;
  const { canvas, ctx } = canvasOf(width, height);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const min: Point2 = [Math.min(...xs), Math.min(...ys)];
  const max: Point2 = [Math.max(...xs), Math.max(...ys)];
  const span = Math.max(max[0] - min[0], max[1] - min[1], 1e-6);
  const scale = Math.min(
    (width - SECTION_MARGIN * 2) / Math.max(max[0] - min[0], span * 0.05),
    (height - SECTION_MARGIN * 2) / Math.max(max[1] - min[1], span * 0.05),
  );
  const toScreen = ([x, y]: Point2): Point2 => [SECTION_MARGIN + (x - min[0]) * scale, height - SECTION_MARGIN - (y - min[1]) * scale];

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1.6;
  picture.bodies.forEach((body, index) => {
    const color = SECTION_PALETTE[index % SECTION_PALETTE.length];
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}22`;
    for (const contour of body.contours) {
      ctx.beginPath();
      contour.points.map(toScreen).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (contour.closed) {
        ctx.closePath();
        ctx.fill("evenodd");
      }
      ctx.stroke();
    }
  });
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "#222222";
  ctx.fillText(picture.title, 12, 22);
  ctx.fillText(`x ${min[0].toFixed(2)}…${max[0].toFixed(2)}  y ${min[1].toFixed(2)}…${max[1].toFixed(2)} мм`, 12, height - 14);
  picture.bodies.forEach((body, index) => {
    ctx.fillStyle = SECTION_PALETTE[index % SECTION_PALETTE.length];
    ctx.fillText(`■ ${body.name}`, width - 240, 22 + index * 18);
  });
  return pngBase64(canvas);
}
