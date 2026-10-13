import type { SketchTool } from "./SketchTool";

export function cancelToolStep(tool: SketchTool): boolean {
  if (!tool.isActive()) return false;
  tool.reset();
  return true;
}
