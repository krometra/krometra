import { ref, computed, watch, type Ref } from "vue";
import { useApi } from "@/composables/useApi";
import { toast } from "@/composables/useToast";
import { sceneStats } from "@/lib/sceneStats";
import type { MeshData } from "@/types/api";
import type { ComponentEntry } from "./useDocumentModel";
import type { ViewportRef } from "./types";
import { hasServerKernelBodies } from "./browserShapeHydration";
import { useBrowserShapeHydration } from "./useBrowserShapeHydration";
import { useSketchOutlineSync } from "./useSketchOutlineSync";

export function useBodyMeshes(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  bodies: Ref<ComponentEntry[]>;
  sketches: Ref<ComponentEntry[]>;
}) {
  const { projectId, viewportRef, bodies, sketches } = deps;
  const api = useApi();
  const browserShapes = useBrowserShapeHydration(projectId);
  const sketchOutlines = useSketchOutlineSync(viewportRef, sketches);

  const meshBodies = ref<{ body_id: string; mesh: MeshData }[]>([]);
  const legacyProject = ref(false);
  const hydrating = ref(false);
  const hydrated = ref(false);

  // Скрытые промежуточные тела не должны попадать в счётчик статус-бара:
  // иначе выходит «1 тело · 17 граней», где 17 — сумма по двум телам.
  const stats = computed(() => sceneStats(bodies.value, meshBodies.value));
  const totalBodies = computed(() => stats.value.bodies);
  const totalFaces = computed(() => stats.value.faces);
  const totalEdges = computed(() => stats.value.edges);

  function colorOf(bodyId: string): string | null {
    const color = bodies.value.find((body) => body.id === bodyId)?.color;
    return typeof color === "string" ? color : null;
  }

  watch(
    () => Object.fromEntries(bodies.value.map((body) => [body.id, body.visible !== false])),
    (next, previous) => {
      for (const [bodyId, visible] of Object.entries(next)) {
        if (previous[bodyId] !== undefined && previous[bodyId] !== visible) viewportRef.value?.setMeshVisibility(bodyId, visible);
      }
    },
  );

  function trackMesh(bodyId: string, mesh: MeshData) {
    viewportRef.value?.addMesh(mesh, bodyId, true, colorOf(bodyId));
    meshBodies.value = [
      ...meshBodies.value.filter((body) => body.body_id !== bodyId),
      { body_id: bodyId, mesh },
    ];
  }

  function untrackMesh(bodyId: string) {
    viewportRef.value?.removeMesh(bodyId);
    meshBodies.value = meshBodies.value.filter((b) => b.body_id !== bodyId);
  }

  function replaceMesh(bodyId: string, mesh: MeshData) {
    untrackMesh(bodyId);
    trackMesh(bodyId, mesh);
  }

  function refreshMesh(bodyId: string, mesh: MeshData) {
    const visible = bodies.value.find((body) => body.id === bodyId)?.visible !== false;
    viewportRef.value?.removeMesh(bodyId);
    viewportRef.value?.addMesh(mesh, bodyId, visible, colorOf(bodyId));
    meshBodies.value = meshBodies.value.map((body) => (body.body_id === bodyId ? { body_id: bodyId, mesh } : body));
  }

  let hydrateInFlight: Promise<void> | null = null;

  async function hydrateBodyMeshes(): Promise<void> {
    await reloadBodyMeshes();
    viewportRef.value?.fitAllBodies();
  }

  function reloadBodyMeshes(): Promise<void> {
    // Параллельные проходы интерливятся на await и оставляют в сцене
    // меши-сироты — второй вызов переиспользует текущий проход
    if (!hydrateInFlight) {
      hydrating.value = true;
      hydrateInFlight = doHydrateBodyMeshes().finally(() => {
        hydrateInFlight = null;
        hydrating.value = false;
        hydrated.value = true;
      });
    }
    return hydrateInFlight;
  }

  async function doHydrateBodyMeshes() {
    browserShapes.resetHydratedBodies();
    viewportRef.value?.clearAllBodies();
    viewportRef.value?.clearAllSketchOutlines();
    meshBodies.value = [];
    legacyProject.value = hasServerKernelBodies(bodies.value);
    if (legacyProject.value) return;
    let failedMeshes = 0;
    const browserHydrations: Promise<Awaited<ReturnType<typeof browserShapes.hydrate>>>[] = [];
    for (const body of bodies.value) {
      try {
        const mesh = await api.get<MeshData>(`/projects/${projectId}/geometry/${body.id}/mesh`);
        viewportRef.value?.addMesh(mesh, body.id, body.visible !== false, colorOf(body.id));
        meshBodies.value.push({ body_id: body.id, mesh });
        browserHydrations.push(browserShapes.hydrate(body));
      } catch (err) {
        failedMeshes++;
        console.error(`Failed to load mesh for body ${body.id}:`, err);
      }
    }
    if (failedMeshes > 0) {
      toast(`Не удалось загрузить геометрию: ${failedMeshes} ${failedMeshes === 1 ? "тело" : "тел(а)"}`, "error");
    }
    const hydrations = await Promise.all(browserHydrations);
    for (const { bodyId, renamedMesh } of hydrations) {
      if (renamedMesh) refreshMesh(bodyId, renamedMesh);
    }
    const failedBrowserHydrations = hydrations.filter((result) => result.status === "failed");
    if (failedBrowserHydrations.length > 0) {
      console.error("Failed to restore browser geometry:", failedBrowserHydrations);
      toast("Не удалось восстановить браузерную геометрию. Обновите документ, чтобы повторить попытку.", "warning");
    }
    sketchOutlines.drawAll();
  }

  return {
    meshBodies,
    legacyProject,
    hydrating,
    hydrated,
    totalBodies,
    totalFaces,
    totalEdges,
    trackMesh,
    untrackMesh,
    replaceMesh,
    refreshMesh,
    hydrateBodyMeshes,
    reloadBodyMeshes,
  };
}

export type BodyMeshesApi = ReturnType<typeof useBodyMeshes>;
