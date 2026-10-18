import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_BODY_COLOR } from "./useBodyRegistry";
import { faceOverlayColor } from "./faceOverlay";
import { useFaceSelection } from "./useFaceSelection";
import type { MeshEntry, SceneContext } from "./types";

const FACES = ["px", "nx", "py", "ny", "pz", "nz"];
const MARK = 0xff9f43;
const HIGHLIGHT = 0x4da6ff;
const BASE = DEFAULT_BODY_COLOR.getHex();

function makeEntry(bodyId: string): MeshEntry {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: DEFAULT_BODY_COLOR }));
  return {
    bodyId,
    mesh,
    faceTriangleMap: FACES.flatMap((face) => [face, face]),
    brepTopo: { faces: [], edges: [] },
    visible: true,
    color: DEFAULT_BODY_COLOR.clone(),
  };
}

function setup() {
  const entry = makeEntry("body-1");
  const context = { entries: [entry] } as unknown as SceneContext;
  const faces = useFaceSelection({ context, onSelected: () => {}, onCleared: () => {} });
  faces.adopt(entry);
  const colorOf = (face: string) => faceOverlayColor(entry.mesh, face)?.getHex() ?? BASE;
  return { faces, colorOf, entry };
}

describe("useFaceSelection: отмеченные грани", () => {
  it("красит отмеченные грани своим цветом и не трогает остальные", () => {
    const { faces, colorOf } = setup();
    faces.markFaces("body-1", ["px", "pz"]);

    expect(colorOf("px")).toBe(MARK);
    expect(colorOf("pz")).toBe(MARK);
    expect(colorOf("nx")).toBe(BASE);
  });

  it("после подсветки отмеченная грань возвращается к цвету отметки, а не к цвету тела", () => {
    const { faces, colorOf } = setup();
    faces.markFaces("body-1", ["px"]);
    faces.highlightFace("px");
    expect(colorOf("px")).toBe(HIGHLIGHT);

    faces.clearHighlight();
    expect(colorOf("px")).toBe(MARK);
  });

  it("новая отметка заменяет прежнюю, снятие возвращает цвет тела", () => {
    const { faces, colorOf } = setup();
    faces.markFaces("body-1", ["px"]);
    faces.markFaces("body-1", ["nx"]);
    expect(colorOf("px")).toBe(BASE);
    expect(colorOf("nx")).toBe(MARK);

    faces.clearMarkedFaces();
    expect(colorOf("nx")).toBe(BASE);
  });

  it("отметка на теле, которого нет в сцене, ничего не красит", () => {
    const { faces, colorOf } = setup();
    faces.markFaces("body-missing", ["px"]);
    faces.highlightFace("nx");
    faces.clearHighlight();
    expect(colorOf("px")).toBe(BASE);
  });

  it("подсветка не трогает буферы и материал тела, снятие убирает накладку", () => {
    const { faces, entry } = setup();
    const material = entry.mesh.material as THREE.MeshStandardMaterial;
    faces.markFaces("body-1", ["px"]);
    faces.highlightFace("nx");
    expect(entry.mesh.geometry.getAttribute("color")).toBeUndefined();
    expect(material.vertexColors).toBe(false);
    expect(material.color.getHex()).toBe(BASE);
    expect(entry.mesh.children).toHaveLength(2);

    faces.clearHighlight();
    faces.clearMarkedFaces();
    expect(entry.mesh.children).toHaveLength(0);
  });

  it("накладка повторяет треугольники грани и не ловит луч", () => {
    const { faces, entry } = setup();
    faces.highlightFace("pz");
    const [overlay] = entry.mesh.children as THREE.Mesh[];
    expect(overlay.geometry.getAttribute("position").count).toBe(6);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(overlay, false)).toEqual([]);
  });

  it("удалённое тело забирает свои накладки", () => {
    const { faces, entry } = setup();
    faces.markFaces("body-1", ["px", "py"]);
    faces.forget(entry);
    expect(entry.mesh.children).toHaveLength(0);
  });
});
