import type { SavedNaming } from "@/lib/browserNaming";
import type { MeshData } from "@/types/api";
import type { ComponentEntry } from "./useDocumentModel";

export type BrowserShapeHydrationStatus = "skipped" | "hydrated" | "already_hydrated" | "failed";

export interface BrowserShapeHydrationResult {
  bodyId: string;
  status: BrowserShapeHydrationStatus;
  error?: Error;
  renamedMesh?: MeshData;
}

export interface StoredBrowserBody {
  step: ArrayBuffer;
  naming: SavedNaming | null;
}

interface BrowserShapeHydratorDependencies {
  loadBody: (body: ComponentEntry) => Promise<StoredBrowserBody>;
  hydrateShape: (bodyId: string, stored: StoredBrowserBody) => Promise<MeshData | null>;
}

export function isBrowserBody(body: ComponentEntry): boolean {
  const source = body.source as Record<string, unknown> | undefined;
  return typeof source?.kind === "string" && source.kind.startsWith("browser_");
}

export function hasServerKernelBodies(bodies: ComponentEntry[]): boolean {
  return bodies.some((body) => !isBrowserBody(body));
}

export function createBrowserShapeHydrator(deps: BrowserShapeHydratorDependencies) {
  const hydratedBodyIds = new Set<string>();
  const pendingHydrations = new Map<string, Promise<BrowserShapeHydrationResult>>();

  function hydrate(body: ComponentEntry): Promise<BrowserShapeHydrationResult> {
    if (!isBrowserBody(body)) {
      return Promise.resolve({ bodyId: body.id, status: "skipped" });
    }
    if (hydratedBodyIds.has(body.id)) {
      return Promise.resolve({ bodyId: body.id, status: "already_hydrated" });
    }

    const pending = pendingHydrations.get(body.id);
    if (pending) return pending;

    const hydration = deps
      .loadBody(body)
      .then((stored) => deps.hydrateShape(body.id, stored))
      .then((renamedMesh): BrowserShapeHydrationResult => {
        hydratedBodyIds.add(body.id);
        return renamedMesh ? { bodyId: body.id, status: "hydrated", renamedMesh } : { bodyId: body.id, status: "hydrated" };
      })
      .catch((error: unknown) => ({
        bodyId: body.id,
        status: "failed" as const,
        error: error instanceof Error ? error : new Error("Не удалось восстановить браузерную геометрию."),
      }))
      .finally(() => {
        pendingHydrations.delete(body.id);
      });

    pendingHydrations.set(body.id, hydration);
    return hydration;
  }

  function resetHydratedBodies() {
    hydratedBodyIds.clear();
  }

  return { hydrate, resetHydratedBodies };
}
