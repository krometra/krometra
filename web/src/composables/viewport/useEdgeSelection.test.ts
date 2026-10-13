import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROUNDED_LOOP, roundedBoxTopo } from "./edgeFixtures";
import { useEdgeSelection, type EdgeSelectionSnapshot } from "./useEdgeSelection";
import type { MeshEntry, SceneContext } from "./types";

const TOP_LOOP = ROUNDED_LOOP.map((name) => `top-${name}`).sort();
const BOX_FACES = ["east", "west", "north", "south", "top", "bottom"];

function makeEntry(bodyId: string, offsetX = 0): MeshEntry {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 10), new THREE.MeshStandardMaterial());
  mesh.position.set(offsetX, 0, 5);
  mesh.updateMatrixWorld(true);
  const topo = roundedBoxTopo();
  const brepTopo = {
    ...topo,
    edges: topo.edges.map((edge) => ({
      ...edge,
      polyline: (edge.polyline ?? []).map((value, index) => (index % 3 === 0 ? value + offsetX : value)),
    })),
  };
  return { bodyId, mesh, faceTriangleMap: BOX_FACES.flatMap((face) => [face, face]), brepTopo, visible: true };
}

function setup() {
  const entries = [makeEntry("body-1"), makeEntry("body-2", 40)];
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(20, 0, 120);
  camera.lookAt(20, 0, 0);
  camera.updateMatrixWorld(true);
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const context: SceneContext = {
    renderer: () => ({ domElement: { clientWidth: 1000, clientHeight: 1000 } }) as never,
    scene: () => new THREE.Scene(),
    camera: () => camera,
    controls: () => ({ target: new THREE.Vector3(20, 0, 0), update: () => {} }),
    raycaster: () => raycaster,
    pointer: () => pointer,
    meshGroup: new THREE.Group(),
    entries,
    ready: () => true,
  };
  const snapshots: EdgeSelectionSnapshot[] = [];
  const edges = useEdgeSelection({ context, onChanged: (snapshot) => snapshots.push(snapshot) });
  const aim = (x: number, y: number, z: number) => {
    const ndc = new THREE.Vector3(x, y, z).project(camera);
    pointer.set(ndc.x, ndc.y);
  };
  const hide = (bodyId: string) => {
    entries.find((entry) => entry.bodyId === bodyId)!.visible = false;
  };
  const colorOf = (bodyId: string, edgeId: string) => {
    const lines = entries.find((entry) => entry.bodyId === bodyId)!.edgeLines!;
    const line = lines.children.find((child) => child.userData["edgeId"] === edgeId) as THREE.Line;
    return (line.material as THREE.LineBasicMaterial).color.getHex();
  };
  const ids = (refs: { edgeId: string | number }[]) => refs.map((edge) => String(edge.edgeId)).sort();
  const selected = () => ids(edges.getSelected());
  const highlighted = () => ids(edges.getHighlighted());
  return { edges, snapshots, aim, hide, colorOf, selected, highlighted, last: () => snapshots[snapshots.length - 1] };
}

const DEFAULT = 0x5a6a8a;
const HOVER = 0x4da6ff;
const SELECTED = 0xffd700;
const FOCUS = 0xffffff;

describe("useEdgeSelection", () => {
  let scene: ReturnType<typeof setup>;

  beforeEach(() => {
    scene = setup();
  });

  it("клик по ребру берёт касательную цепочку, повторный — снимает её", () => {
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    expect(scene.selected()).toEqual(TOP_LOOP);
    expect(scene.last()).toMatchObject({ bodyId: "body-1", chain: true });
    expect(scene.last().groups).toHaveLength(1);

    scene.aim(10, 0, 10);
    scene.edges.handleClick();
    expect(scene.selected()).toEqual([]);
    expect(scene.last()).toMatchObject({ bodyId: null, edgeIds: [], groups: [], brepTopo: null });
  });

  it("с выключенной цепочкой клик берёт одно ребро", () => {
    scene.edges.setChain(false);
    expect(scene.last().chain).toBe(false);
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    expect(scene.selected()).toEqual(["top-s"]);
  });

  it("клик по грани мимо рёбер берёт все её рёбра, повторный — снимает", () => {
    scene.aim(0, 0, 10);
    scene.edges.handleClick();
    expect(scene.selected()).toEqual(TOP_LOOP);
    scene.edges.handleClick();
    expect(scene.selected()).toEqual([]);
  });

  it("клик в пустоту выбор не трогает", () => {
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    scene.aim(20, 40, 0);
    scene.edges.handleClick();
    expect(scene.selected()).toEqual(TOP_LOOP);
    expect(scene.snapshots).toHaveLength(1);
  });

  it("ховер подсвечивает всю цепочку, которую возьмёт клик", () => {
    scene.aim(0, -10, 10);
    expect(scene.edges.handleHover()).toBe(true);
    expect(scene.edges.getHovered()).toEqual({ bodyId: "body-1", edgeId: "top-s" });
    expect(scene.highlighted()).toEqual(TOP_LOOP);
    for (const edgeId of TOP_LOOP) expect(scene.colorOf("body-1", edgeId)).toBe(HOVER);
    expect(scene.colorOf("body-1", "v-s-e")).toBe(DEFAULT);

    scene.edges.handleClick();
    expect(scene.highlighted()).toEqual(scene.selected());
  });

  it("ховер над гранью подсвечивает её рёбра, уход курсора гасит подсветку", () => {
    scene.aim(0, 0, 10);
    expect(scene.edges.handleHover()).toBe(true);
    expect(scene.edges.getHovered()).toBeNull();
    expect(scene.colorOf("body-1", "top-n")).toBe(HOVER);

    scene.aim(20, 40, 0);
    expect(scene.edges.handleHover()).toBe(false);
    expect(scene.colorOf("body-1", "top-n")).toBe(DEFAULT);
  });

  it("выбранные рёбра под ховером отмечены как снимаемые и возвращаются к выбранным", () => {
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    scene.edges.handleHover();
    expect(scene.colorOf("body-1", "top-n")).toBe(FOCUS);
    scene.edges.clearHover();
    expect(scene.colorOf("body-1", "top-n")).toBe(SELECTED);
  });

  it("снятие из списка работает как клик по ребру", () => {
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    scene.edges.toggleEdge("body-1", "top-nw");
    expect(scene.selected()).toEqual([]);

    scene.edges.setChain(false);
    scene.edges.toggleEdge("body-1", "top-s");
    scene.edges.toggleEdge("body-1", "top-se");
    scene.edges.toggleEdge("body-1", "top-s");
    expect(scene.selected()).toEqual(["top-se"]);
  });

  it("строка списка подсвечивает свои рёбра в сцене", () => {
    scene.edges.setChain(false);
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    scene.edges.highlight("body-1", ["top-s"]);
    expect(scene.colorOf("body-1", "top-s")).toBe(FOCUS);
    scene.edges.clearHover();
    expect(scene.colorOf("body-1", "top-s")).toBe(SELECTED);
  });

  it("включение цепочки пересобирает строки списка", () => {
    scene.edges.setChain(false);
    scene.edges.toggleEdge("body-1", "top-s");
    scene.edges.toggleEdge("body-1", "top-se");
    expect(scene.last().groups).toEqual([["top-s"], ["top-se"]]);
    scene.edges.setChain(true);
    expect(scene.last().groups).toEqual([["top-s", "top-se"]]);
  });

  it("выбор держится в пределах одного тела", () => {
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    scene.aim(40, -10, 10);
    scene.edges.handleClick();
    expect(scene.last().bodyId).toBe("body-2");
    expect(scene.selected()).toEqual(TOP_LOOP);
    expect(scene.colorOf("body-1", "top-s")).toBe(DEFAULT);
  });

  it("выбор по идентификатору берёт ровно названное ребро, даже при включённой цепочке", () => {
    expect(scene.edges.selectById("body-1", "top-s")).toBe(true);
    expect(scene.selected()).toEqual(["top-s"]);
    expect(scene.last()).toMatchObject({ bodyId: "body-1", edgeIds: ["top-s"], chain: true });

    expect(scene.edges.selectById("body-1", "top-s")).toBe(true);
    expect(scene.edges.selectById("body-1", "v-s-e")).toBe(true);
    expect(scene.selected()).toEqual(["top-s", "v-s-e"]);
    expect(scene.snapshots).toHaveLength(2);
    expect(scene.colorOf("body-1", "top-s")).toBe(SELECTED);
    expect(scene.colorOf("body-1", "top-se")).toBe(DEFAULT);
  });

  it("выбор по идентификатору отказывает на неизвестном ребре и скрытом теле", () => {
    expect(scene.edges.selectById("body-1", "no-such-edge")).toBe(false);
    expect(scene.edges.selectById("no-such-body", "top-s")).toBe(false);
    scene.hide("body-2");
    expect(scene.edges.selectById("body-2", "top-s")).toBe(false);
    expect(scene.snapshots).toHaveLength(0);
  });

  it("сброс снимает всё и сообщает об этом", () => {
    scene.aim(0, -10, 10);
    scene.edges.handleClick();
    scene.edges.clearSelection();
    expect(scene.selected()).toEqual([]);
    expect(scene.last().edgeIds).toEqual([]);
    expect(scene.colorOf("body-1", "top-s")).toBe(DEFAULT);
  });
});
