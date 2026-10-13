import { describe, expect, it, vi } from "vitest";
import { createBrowserShapeHydrator, hasServerKernelBodies, isBrowserBody, type StoredBrowserBody } from "./browserShapeHydration";
import type { ComponentEntry } from "./useDocumentModel";

const browserBody: ComponentEntry = { id: "browser-body", source: { kind: "browser_extrude" } };
const serverBody: ComponentEntry = { id: "occ-body", source: { kind: "extrude" } };
const stored: StoredBrowserBody = { step: new ArrayBuffer(4), naming: null };

describe("isBrowserBody", () => {
  it("recognizes only browser geometry sources", () => {
    expect(isBrowserBody(browserBody)).toBe(true);
    expect(isBrowserBody({ id: "occ-body", source: { kind: "extrude" } })).toBe(false);
    expect(isBrowserBody({ id: "no-source" })).toBe(false);
  });
});

describe("hasServerKernelBodies", () => {
  it("detects projects built by the removed server kernel", () => {
    expect(hasServerKernelBodies([browserBody])).toBe(false);
    expect(hasServerKernelBodies([])).toBe(false);
    expect(hasServerKernelBodies([browserBody, serverBody])).toBe(true);
  });
});

describe("createBrowserShapeHydrator", () => {
  it("shares concurrent work, caches within a pass, and reloads on the next pass", async () => {
    let resolveStep: ((stored: StoredBrowserBody) => void) | undefined;
    const loadBody = vi.fn()
      .mockImplementationOnce(() => new Promise<StoredBrowserBody>((resolve) => { resolveStep = resolve; }))
      .mockResolvedValueOnce(stored);
    const hydrateShape = vi.fn().mockResolvedValue(null);
    const hydrator = createBrowserShapeHydrator({ loadBody, hydrateShape });

    const first = hydrator.hydrate(browserBody);
    const second = hydrator.hydrate(browserBody);
    resolveStep?.(stored);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { bodyId: "browser-body", status: "hydrated" },
      { bodyId: "browser-body", status: "hydrated" },
    ]);
    await expect(hydrator.hydrate(browserBody)).resolves.toEqual({ bodyId: "browser-body", status: "already_hydrated" });
    hydrator.resetHydratedBodies();
    await expect(hydrator.hydrate(browserBody)).resolves.toEqual({ bodyId: "browser-body", status: "hydrated" });
    expect(loadBody).toHaveBeenCalledTimes(2);
    expect(hydrateShape).toHaveBeenCalledTimes(2);
    expect(hydrateShape).toHaveBeenCalledWith("browser-body", stored);
  });

  it("returns the renamed mesh of a body saved without a naming table", async () => {
    const mesh = { vertices: [], indices: [], brep_topo: { faces: [], edges: [] }, bbox: { min: [0, 0, 0], max: [0, 0, 0] }, face_triangle_map: [] };
    const hydrator = createBrowserShapeHydrator({ loadBody: vi.fn().mockResolvedValue(stored), hydrateShape: vi.fn().mockResolvedValue(mesh) });

    await expect(hydrator.hydrate(browserBody)).resolves.toEqual({ bodyId: "browser-body", status: "hydrated", renamedMesh: mesh });
  });

  it("returns a failure without caching it, so a later refresh retries", async () => {
    const loadBody = vi.fn()
      .mockRejectedValueOnce(new Error("STEP unavailable"))
      .mockResolvedValueOnce(stored);
    const hydrateShape = vi.fn().mockResolvedValue(null);
    const hydrator = createBrowserShapeHydrator({ loadBody, hydrateShape });

    await expect(hydrator.hydrate(browserBody)).resolves.toMatchObject({
      bodyId: "browser-body",
      status: "failed",
      error: expect.objectContaining({ message: "STEP unavailable" }),
    });
    await expect(hydrator.hydrate(browserBody)).resolves.toEqual({ bodyId: "browser-body", status: "hydrated" });
    expect(loadBody).toHaveBeenCalledTimes(2);
  });

  it("skips network work for server kernel bodies", async () => {
    const loadBody = vi.fn();
    const hydrator = createBrowserShapeHydrator({ loadBody, hydrateShape: vi.fn() });

    await expect(hydrator.hydrate(serverBody)).resolves.toEqual({ bodyId: "occ-body", status: "skipped" });
    expect(loadBody).not.toHaveBeenCalled();
  });
});
