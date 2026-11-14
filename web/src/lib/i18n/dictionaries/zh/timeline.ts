import type { DomainMessages } from "../../message";

export const timeline = {
  "timeline.mm": "毫米",
  "timeline.pieces": "个",
  "timeline.profiles": "个轮廓",
  "timeline.spacing": "间距",
  "timeline.through": "贯穿",
  "timeline.onFace": "按面",
  "timeline.merged": "已合并",
  "timeline.copy": "副本",
  "timeline.fromFace": "从面",
  "timeline.fromPlane": "从",
  "timeline.faces": "面数：",
  "timeline.newBody": "新实体",
  "timeline.faceShort": "个面",
  "timeline.linear": "线性",
  "timeline.smooth": "平滑",
  "timeline.failed": "错误：{error}",
  "timeline.suppressed": "已抑制：模型构建时未包含此操作。",
  "timeline.rolledBack": "位于回滚标记之后：未包含在模型中。"
} as const satisfies DomainMessages<"timeline">;
