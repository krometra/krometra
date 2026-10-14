import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { DEFAULT_BODY_COLOR } from "./useBodyRegistry";
import { useBodySelection } from "./useBodySelection";
import type { MeshEntry, SceneContext } from "./types";

function makeEntry(bodyId: string): MeshEntry {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: DEFAULT_BODY_COLOR }),
  );
  return { bodyId, mesh, faceTriangleMap: [], brepTopo: { faces: [], edges: [] }, visible: true, color: DEFAULT_BODY_COLOR.clone() };
}

function makeContext(entries: MeshEntry[]): SceneContext {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  return {
    renderer: () => ({ domElement: { clientWidth: 100, clientHeight: 100 } }) as never,
    scene: () => new THREE.Scene(),
    camera: () => camera,
    controls: () => ({ target: new THREE.Vector3(), update: () => {} }),
    raycaster: () => raycaster,
    pointer: () => pointer,
    meshGroup: new THREE.Group(),
    entries,
    ready: () => true,
  };
}

function setup() {
  const entries = [makeEntry("body-1"), makeEntry("body-2"), makeEntry("body-3")];
  const events: string[] = [];
  const selection = useBodySelection({
    context: makeContext(entries),
    onSelected: (id) => events.push(`+${id}`),
    onDeselected: (id) => events.push(`-${id}`),
    onCleared: () => events.push("cleared"),
  });
  const colorOf = (bodyId: string) =>
    (entries.find((e) => e.bodyId === bodyId)!.mesh.material as THREE.MeshStandardMaterial).color.getHex();
  return { selection, events, colorOf };
}

const TARGET = 0x4da6ff;
const TOOL = 0xff8c42;
const DEFAULT = DEFAULT_BODY_COLOR.getHex();

describe("useBodySelection", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("слоты цели и инструмента красятся своими цветами", () => {
    s.selection.selectAsTarget("body-1");
    s.selection.selectAsTool("body-2");
    expect(s.selection.getSelected()).toEqual({ targetId: "body-1", toolId: "body-2" });
    expect(s.colorOf("body-1")).toBe(TARGET);
    expect(s.colorOf("body-2")).toBe(TOOL);
  });

  it("смена тела в слоте возвращает прежнему цвет по умолчанию", () => {
    s.selection.selectAsTarget("body-1");
    s.selection.selectAsTarget("body-2");
    expect(s.colorOf("body-1")).toBe(DEFAULT);
    expect(s.selection.getSelected().targetId).toBe("body-2");
    expect(s.events).toEqual(["+body-1", "-body-1", "+body-2"]);
  });

  it("тело нельзя занять обеими ролями сразу: прежняя роль освобождается", () => {
    s.selection.selectAsTarget("body-1");
    s.selection.selectAsTool("body-1");
    expect(s.selection.getSelected()).toEqual({ targetId: null, toolId: "body-1" });
    expect(s.colorOf("body-1")).toBe(TOOL);
  });

  it("повторное назначение той же роли ничего не меняет", () => {
    s.selection.selectAsTarget("body-1");
    const before = [...s.events];
    s.selection.selectAsTarget("body-1");
    expect(s.events).toEqual(before);
    expect(s.colorOf("body-1")).toBe(TARGET);
  });

  it("clear освобождает оба слота и сообщает о снятии", () => {
    s.selection.selectAsTarget("body-1");
    s.selection.selectAsTool("body-2");
    s.selection.clear();
    expect(s.selection.getSelected()).toEqual({ targetId: null, toolId: null });
    expect(s.colorOf("body-1")).toBe(DEFAULT);
    expect(s.colorOf("body-2")).toBe(DEFAULT);
    expect(s.events.filter((e) => e.startsWith("-"))).toEqual(["-body-1", "-body-2"]);
  });

  it("forget освобождает слот удалённого тела без событий", () => {
    s.selection.selectAsTarget("body-1");
    const before = s.events.length;
    s.selection.forget("body-1");
    expect(s.selection.getSelected().targetId).toBeNull();
    expect(s.events.length).toBe(before);
  });
});
