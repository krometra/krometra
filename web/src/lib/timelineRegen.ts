import type { TimelineEntry } from "@/types/api";
import type { ModelDocument } from "./bodyHistory";
import type { RebuildFailure } from "./browserRebuildEngine";
import type { RebuildPlanStep } from "./browserRebuildPlan";
import { syncLiveness } from "./timelineLiveness";

const MAX_ERROR_LENGTH = 500;

export function regeneratedEntryIds(steps: RebuildPlanStep[]): Set<string> {
  return new Set(steps.filter((step) => step.kind !== "alias").map((step) => step.entryId));
}

function withStatus(entry: TimelineEntry, failure: string | undefined): TimelineEntry {
  const { error_message: _previous, ...rest } = entry;
  if (failure === undefined) return { ...rest, status: "ok" };
  return { ...rest, status: "error", error_message: failure.slice(0, MAX_ERROR_LENGTH) };
}

export function withRegenStatuses(document: ModelDocument, steps: RebuildPlanStep[], failures: RebuildFailure[]): ModelDocument {
  const regenerated = regeneratedEntryIds(steps);
  const failed = new Map(failures.map((failure) => [failure.entryId, failure.message]));
  return {
    components: document.components,
    timeline: document.timeline.map((entry) => (regenerated.has(entry.id) ? withStatus(entry, failed.get(entry.id)) : entry)),
  };
}

export function regeneratedDocument(
  before: ModelDocument,
  edited: ModelDocument,
  steps: RebuildPlanStep[],
  failures: RebuildFailure[],
): ModelDocument {
  return syncLiveness(before, withRegenStatuses(edited, steps, failures));
}
