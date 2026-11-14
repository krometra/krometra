import type { DomainMessages } from "../../message";

export const timeline = {
  "timeline.mm": "mm",
  "timeline.pieces": "pcs",
  "timeline.profiles": "profiles",
  "timeline.spacing": "spacing",
  "timeline.through": "through all",
  "timeline.onFace": "on face",
  "timeline.merged": "joined",
  "timeline.copy": "copy",
  "timeline.fromFace": "from face",
  "timeline.fromPlane": "from",
  "timeline.faces": "faces:",
  "timeline.newBody": "new body",
  "timeline.faceShort": "faces",
  "timeline.linear": "linear",
  "timeline.smooth": "smooth",
  "timeline.failed": "Error: {error}",
  "timeline.suppressed": "Suppressed: the model was built without this operation.",
  "timeline.rolledBack": "After the rollback marker: not included in the model."
} as const satisfies DomainMessages<"timeline">;
