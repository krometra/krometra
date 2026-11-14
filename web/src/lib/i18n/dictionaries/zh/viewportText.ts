import type { DomainMessages } from "../../message";

export const viewportText = {
  "viewportText.shaded": "着色",
  "viewportText.shadedEdges": "着色并显示边线",
  "viewportText.wireframe": "线框",
  "viewportText.hiddenLine": "可见边线",
  "viewportText.selectBody": "选择实体",
  "viewportText.selectEdges": "选择边线",
  "viewportText.measure": "测量",
  "viewportText.selectPlaneReference": "选择平面参考",
  "viewportText.isometric": "等轴测视图",
  "viewportText.front": "前",
  "viewportText.back": "后",
  "viewportText.top": "上",
  "viewportText.bottom": "下",
  "viewportText.left": "左",
  "viewportText.right": "右",
  "viewportText.edgeLine": "线段 {length} 毫米",
  "viewportText.edgeArc": "圆弧 R{radius} · {length} 毫米",
  "viewportText.edgeCircle": "圆 ⌀{diameter} 毫米",
  "viewportText.edgeCurve": "曲线 {length} 毫米",
  "viewportText.sampleDimension": "120.0 毫米",
  "viewportText.edgeChain": {
    "other": "链：{count} 条边 · {length} 毫米"
  }
} as const satisfies DomainMessages<"viewportText">;
