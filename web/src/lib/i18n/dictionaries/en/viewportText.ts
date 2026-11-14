import type { DomainMessages } from "../../message";

export const viewportText = {
  "viewportText.shaded": "Shaded",
  "viewportText.shadedEdges": "Shaded with edges",
  "viewportText.wireframe": "Wireframe",
  "viewportText.hiddenLine": "Visible edges",
  "viewportText.selectBody": "Select body",
  "viewportText.selectEdges": "Select edges",
  "viewportText.measure": "Measure",
  "viewportText.selectPlaneReference": "Select plane reference",
  "viewportText.isometric": "Isometric view",
  "viewportText.front": "FRONT",
  "viewportText.back": "BACK",
  "viewportText.top": "TOP",
  "viewportText.bottom": "BOTTOM",
  "viewportText.left": "LEFT",
  "viewportText.right": "RIGHT",
  "viewportText.edgeLine": "Segment {length} mm",
  "viewportText.edgeArc": "Arc R{radius} · {length} mm",
  "viewportText.edgeCircle": "Circle ⌀{diameter} mm",
  "viewportText.edgeCurve": "Curve {length} mm",
  "viewportText.sampleDimension": "120.0 mm",
  "viewportText.edgeChain": {
    "one": "Chain: {count} edge · {length} mm",
    "other": "Chain: {count} edges · {length} mm"
  }
} as const satisfies DomainMessages<"viewportText">;
