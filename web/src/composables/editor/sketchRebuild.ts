import { useApi } from "@/composables/useApi";
import { sketchRebuildRoots } from "@/lib/browserRebuildPlan";
import type { Document } from "@/types/api";

export async function rebuildSketchDependents(projectId: string, sketchId: string): Promise<number> {
  const document = await useApi().get<Document>(`/projects/${projectId}/document`);
  const roots = sketchRebuildRoots(document, sketchId);
  const { BrowserRebuildCommand } = await import("@/core/commands/BrowserRebuildCommand");
  for (const entryId of roots) {
    await new BrowserRebuildCommand(projectId, entryId, {}, {}, () => undefined).execute();
  }
  return roots.length;
}
