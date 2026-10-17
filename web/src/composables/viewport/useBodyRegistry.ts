import * as THREE from "three";
import type { MeshData } from "@/types/api";
import type { MeshEntry, RenderingMode } from "./types";
import { findByBody } from "./types";

export const DEFAULT_BODY_COLOR = new THREE.Color(0x8fb8df);

function buildShadedEdges(mesh: THREE.Mesh): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 15),
    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }),
  );
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
}

/**
 * Реестр тел сцены: добавление/удаление мешей, видимость и режимы рендера.
 * Единственный владелец `entries` — остальные composables только читают.
 */
export function useBodyRegistry(options: {
  entries: MeshEntry[];
  meshGroup: THREE.Group;
  shadedEdgesGroup: THREE.Group;
  renderingMode: () => RenderingMode;
  onMeshRemoved: (entry: MeshEntry) => void;
  onMeshAdded: (entry: MeshEntry) => void;
  fitCameraToSphere: (sphere: THREE.Sphere) => void;
}) {
  const { entries, meshGroup, shadedEdgesGroup } = options;
  const shadedEdgesMap = new Map<string, THREE.LineSegments>();

  function showsShadedEdges(mode: RenderingMode): boolean {
    return mode === "shaded_edges" || mode === "hidden_line";
  }

  function addMesh(meshData: MeshData, bodyId = "body-1", visible = true, color: string | null = null) {
    if (findByBody(entries, bodyId)) removeMesh(bodyId);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(meshData.vertices), 3));
    geometry.setIndex(meshData.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    // flatShading: нормали с сервера не приходят, computeVertexNormals на общих
    // вершинах усредняет их по рёбрам — без этого куб выглядит полым
    const baseColor = color ? new THREE.Color(color) : DEFAULT_BODY_COLOR.clone();
    const material = new THREE.MeshStandardMaterial({
      color: baseColor.clone(),
      roughness: 0.52,
      metalness: 0.05,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData["bodyId"] = bodyId;
    mesh.userData["brepTopo"] = meshData.brep_topo;

    const entry: MeshEntry = {
      bodyId,
      mesh,
      faceTriangleMap: meshData.face_triangle_map ?? [],
      brepTopo: meshData.brep_topo ?? { faces: [], edges: [] },
      visible,
      color: baseColor,
    };

    if (visible) meshGroup.add(mesh);
    entries.push(entry);
    options.onMeshAdded(entry);

    if (geometry.boundingSphere) options.fitCameraToSphere(geometry.boundingSphere);

    const mode = options.renderingMode();
    if (showsShadedEdges(mode)) {
      const shadedEdges = buildShadedEdges(mesh);
      shadedEdgesMap.set(bodyId, shadedEdges);
      shadedEdgesGroup.add(shadedEdges);
    }
    if (mode === "hidden_line") {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
  }

  function removeMesh(bodyId: string) {
    const idx = entries.findIndex((e) => e.bodyId === bodyId);
    if (idx === -1) return;

    const entry = entries[idx];
    options.onMeshRemoved(entry);
    meshGroup.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    disposeMaterial(entry.mesh.material);
    entries.splice(idx, 1);

    const shadedEdges = shadedEdgesMap.get(bodyId);
    if (shadedEdges) {
      shadedEdgesGroup.remove(shadedEdges);
      shadedEdges.geometry.dispose();
      disposeMaterial(shadedEdges.material);
      shadedEdgesMap.delete(bodyId);
    }
  }

  function showInScene(entry: MeshEntry, shown: boolean) {
    if (shown && !meshGroup.children.includes(entry.mesh)) meshGroup.add(entry.mesh);
    if (!shown) meshGroup.remove(entry.mesh);
    const shadedEdges = shadedEdgesMap.get(entry.bodyId);
    if (shadedEdges) shadedEdges.visible = shown;
  }

  function setMeshVisibility(bodyId: string, visible: boolean) {
    const entry = findByBody(entries, bodyId);
    if (!entry) return;
    entry.visible = visible;
    showInScene(entry, visible);
  }

  function isolate(bodyIds: string[] | null) {
    for (const entry of entries) showInScene(entry, bodyIds ? bodyIds.includes(entry.bodyId) : entry.visible);
  }

  function setMeshColor(bodyId: string, color: string | null) {
    const entry = findByBody(entries, bodyId);
    if (!entry) return;
    entry.color = color ? new THREE.Color(color) : DEFAULT_BODY_COLOR.clone();
    const material = entry.mesh.material as THREE.MeshStandardMaterial;
    entry.mesh.geometry.deleteAttribute("color");
    material.vertexColors = false;
    material.color.copy(entry.color);
    material.needsUpdate = true;
  }

  function clearAll() {
    for (const entry of [...entries]) removeMesh(entry.bodyId);
  }

  function applyRenderingMode(mode: RenderingMode) {
    // Снимаем рёбра с группы, но оставляем их в кэше
    while (shadedEdgesGroup.children.length > 0) {
      shadedEdgesGroup.remove(shadedEdgesGroup.children[0]);
    }

    for (const entry of entries) {
      const mat = entry.mesh.material as THREE.MeshStandardMaterial;
      entry.mesh.visible = entry.visible;
      mat.wireframe = mode === "wireframe";

      // hidden_line: сдвигаем заливку вглубь, чтобы линии рёбер проходили depth test
      const offset = mode === "hidden_line";
      mat.polygonOffset = offset;
      mat.polygonOffsetFactor = offset ? 1 : 0;
      mat.polygonOffsetUnits = offset ? 1 : 0;

      if (mode !== "wireframe" && showsShadedEdges(mode) && entry.visible) {
        let shadedEdges = shadedEdgesMap.get(entry.bodyId);
        if (!shadedEdges) {
          shadedEdges = buildShadedEdges(entry.mesh);
          shadedEdgesMap.set(entry.bodyId, shadedEdges);
        }
        shadedEdgesGroup.add(shadedEdges);
      }
    }
  }

  function getBodyIds(): string[] {
    return entries.filter((e) => e.visible).map((e) => e.bodyId);
  }

  return { addMesh, removeMesh, setMeshVisibility, setMeshColor, isolate, clearAll, applyRenderingMode, getBodyIds };
}
