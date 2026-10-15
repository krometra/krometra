import * as THREE from "three";
import type { SketchEntity, SketchPoint } from "@/types/api";
import type { BrowserExtrudeSpan } from "@/lib/browserExtrudeExtent";
import { profileFaces } from "@/sketcher/contours";
import type { SceneContext, SketchFrame } from "./types";
import { findByBody } from "./types";
import { frameNormal, resolveFrame } from "./useSketchOutlines";
import { edgePoints } from "./edgeGeometry";

export const PREVIEW_COLOR = 0x4da6ff;
// Резьбу строят на ВЫБРАННОЙ грани, а выделение красит её в тот же синий
// (`useFaceSelection: HIGHLIGHT_COLOR`) — синий призрак на ней не читался бы.
const THREAD_COLOR = 0xffa640;

/** Профилей на оборот у призрака: как у инструмента ядра, но вдвое чаще. */
const THREAD_SEGMENTS_PER_TURN = 48;

/**
 * Запас поверх провиса хорды, на который призрак выносится от поверхности.
 *
 * Призрак — многогранник, и между узлами его грань проседает внутрь цилиндра
 * на sagitta = R·(1 − cos(π/n)). Если не поднять его на этот провис, витки
 * ныряют под поверхность детали и распадаются на пунктир из чёрточек — ровно
 * та же ловушка, что у режущего клина на сервере (`thread.py: _overshoot`).
 */
const SURFACE_LIFT_MARGIN = 1.6;

/** Цилиндрическая грань, на которой рисуется призрак резьбы. */
export interface ThreadCylinder {
  radius: number;
  origin: [number, number, number] | number[];
  direction: [number, number, number] | number[];
  /** Смещение начала грани вдоль оси от origin. */
  start: number;
  length: number;
  external: boolean;
}

export interface ThreadPreviewParams {
  pitch: number;
  depth: number;
  /** 0 или null — резьба на всю грань. */
  length: number | null;
  offset: number;
  starts: number;
  rightHanded: boolean;
  /** Доля шага под плоской вершиной клина: 0 — острый треугольник. */
  crestRatio: number;
}

/**
 * Материал призрака резьбы: тот же полупрозрачный вид, но поверх тела.
 *
 * Клин резьбы целиком утоплен в материал — с обычным depthTest его закрывает
 * сама деталь, и виден только заусенец на кромке. Рисуем без проверки
 * глубины: форма профиля остаётся честной, но её видно насквозь, как
 * рентгеном.
 */
/**
 * Материал призрака резьбы.
 *
 * Глубину проверяем как обычно, поэтому деталь честно закрывает витки с
 * дальней стороны (пробовали `depthTest = false` — стержень просвечивал
 * насквозь, и профиль тонул в каше из наложенных витков). Видимость ближних
 * витков даёт вынос поверхности на провис хорды, см. `SURFACE_LIFT_MARGIN`.
 */
function threadMaterial(): THREE.MeshStandardMaterial {
  const material = previewMaterial(THREAD_COLOR);
  material.opacity = 0.85;
  return material;
}

export function previewMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    roughness: 0.5,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

export function disposeObject(object: THREE.Object3D) {
  const disposed = new Set<THREE.Material>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const mat = child.material as THREE.Material;
    if (!disposed.has(mat)) {
      disposed.add(mat);
      mat.dispose();
    }
  });
}


/**
 * Осевое сечение витка резьбы: [радиус, смещение вдоль оси].
 *
 * Рисуем не режущий клин, а сам виток — гребень, который останется на детали
 * между соседними резами. Форма выводится из инструмента ядра
 * (`geometry/thread.py: _profile_points`): клин снимает материал шириной в
 * шаг, сходясь к вершине, значит нетронутым остаётся гребень, сужающийся к
 * поверхности. `crestRatio` расширяет вершину клина, то есть дно впадины, —
 * и гребень от этого становится уже, как на настоящей крупной резьбе.
 */
function threadCrestProfile(
  radius: number,
  depth: number,
  pitch: number,
  external: boolean,
  crestRatio: number,
): [number, number][] {
  const sign = external ? -1 : 1;
  const root = radius + sign * depth;
  const half = pitch / 2;
  // Дно впадины занимает crestRatio шага, остальное — скосы витка.
  const flat = half * Math.min(crestRatio, 0.98);
  // Ширина гребня: то, что осталось от шага после впадины и скосов. У
  // метрической резьбы гребень острый, поэтому держим минимум, иначе виток
  // вырождается в невидимую линию.
  const crest = Math.max((half - flat) * 0.5, half * 0.08);

  return [
    [root, -half],
    [radius, -crest],
    [radius, crest],
    [root, half],
  ];
}

/**
 * Поверхность-лента по кольцам профиля.
 *
 * Профиль витка разомкнут (это полоса на детали, а не тело), поэтому
 * последнюю точку с первой не соединяем и торцов не ставим.
 */
function ribbonGeometry(rings: THREE.Vector3[][]): THREE.BufferGeometry {
  const n = rings[0].length;
  const positions: number[] = [];

  const push = (p: THREE.Vector3) => positions.push(p.x, p.y, p.z);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    push(a);
    push(b);
    push(c);
  };

  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let k = 0; k < n - 1; k += 1) {
      tri(a[k], a[k + 1], b[k + 1]);
      tri(a[k], b[k + 1], b[k]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Полупрозрачные призраки операций: выдавливание и скругление/фаска. */
export function usePreviews(context: SceneContext) {
  let extrudeMesh: THREE.Mesh | null = null;
  let filletGroup: THREE.Group | null = null;
  let threadGroup: THREE.Group | null = null;

  function showExtrude(
    entities: SketchEntity[],
    sketchFrame: SketchFrame,
    span: BrowserExtrudeSpan,
    color = PREVIEW_COLOR,
  ) {
    hideExtrude();
    const depth = span.end - span.start;
    if (!context.ready() || !(depth > 0)) return;

    const toVectors = (points: SketchPoint[]) => points.map((p) => new THREE.Vector2(p.x, p.y));
    const shapes = profileFaces(entities).map((face) => {
      const shape = new THREE.Shape(toVectors(face.outer));
      shape.holes = face.holes.map((hole) => new THREE.Path(toVectors(hole)));
      return shape;
    });
    if (!shapes.length) return;

    const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });

    const frame = resolveFrame(sketchFrame);
    const n = frameNormal(sketchFrame);
    const origin = frame.origin.clone().addScaledVector(n, span.start);

    const matrix = new THREE.Matrix4().makeBasis(frame.u.clone(), frame.v.clone(), n);
    matrix.setPosition(origin);
    geometry.applyMatrix4(matrix);

    extrudeMesh = new THREE.Mesh(geometry, previewMaterial(color));
    context.scene().add(extrudeMesh);
  }

  function hideExtrude() {
    if (!extrudeMesh) return;
    context.scene()?.remove(extrudeMesh);
    disposeObject(extrudeMesh);
    extrudeMesh = null;
  }

  function showFillet(bodyId: string, edgeIds: (string | number)[], radius: number) {
    hideFillet();
    if (!context.ready() || !(radius > 0) || edgeIds.length === 0) return;

    const entry = findByBody(context.entries, bodyId);
    if (!entry) return;

    const wanted = new Set(edgeIds);
    const material = previewMaterial(PREVIEW_COLOR);
    const group = new THREE.Group();

    for (const edge of entry.brepTopo.edges ?? []) {
      if (!wanted.has(edge.edge_id)) continue;
      const points = edgePoints(entry, edge);
      if (points.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(points);
      const segments = Math.max(8, points.length * 2);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 16, false), material));
    }

    if (group.children.length === 0) {
      material.dispose();
      return;
    }
    context.scene().add(group);
    filletGroup = group;
  }

  function hideFillet() {
    if (!filletGroup) return;
    context.scene()?.remove(filletGroup);
    disposeObject(filletGroup);
    filletGroup = null;
  }

  /**
   * Призрак резьбы: тот самый материал, который уйдёт из тела.
   *
   * Строится клин того же профиля, что сервер вычитает из детали (см.
   * `geometry/thread.py: _profile_points`), и протягивается по винтовой
   * линии. Считаем на клиенте, потому что настоящее вычитание занимает
   * секунды, а призрак обязан идти за ползунком сразу.
   *
   * Раньше здесь рисовались трубки по поверхности грани: они показывали шаг и
   * заходы, но врали о форме — толстые валики снаружи детали вместо острой
   * канавки внутрь. По такому призраку нельзя было судить о профиле, ради
   * которого предпросмотр и нужен.
   */
  function showThread(cylinder: ThreadCylinder, params: ThreadPreviewParams) {
    hideThread();
    if (!context.ready()) return;

    const { pitch, depth, starts, rightHanded, crestRatio } = params;
    if (!(pitch > 0) || !(depth > 0) || starts < 1) return;

    const lead = pitch * starts;
    const full = cylinder.length - params.offset;
    const length = Math.min(params.length && params.length > 0 ? params.length : full, full);
    if (!(length >= lead)) return;

    const axis = new THREE.Vector3(...cylinder.direction).normalize();
    const origin = new THREE.Vector3(...cylinder.origin);
    // Пара ортов поперёк оси — та же, что строит клин на сервере.
    const seed = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(seed, axis).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();

    // Волосок наружу: поверхность призрака совпадает с гранью детали, и без
    // выноса они спорят за глубину — витки мерцают и рвутся на пунктир.
    const sagitta = cylinder.radius * (1 - Math.cos(Math.PI / THREAD_SEGMENTS_PER_TURN));
    // Готовая резьба лежит ГЛУБЖЕ грани: гребень вровень с поверхностью, дно
    // впадины утоплено на глубину профиля. Такой призрак деталь закрывает
    // целиком — наружу торчит только гребень, и вместо витков видна гладкая
    // труба. Поэтому сажаем виток верхом на поверхность: половина профиля
    // выступает наружу, половина утоплена в тело. Форма, шаг, заходы и
    // положение вдоль оси остаются точными, средний радиус — ровно радиус
    // грани, а витки при этом читаются с любого ракурса.
    const lift = depth / 2 + sagitta * SURFACE_LIFT_MARGIN;
    const profile = threadCrestProfile(
      cylinder.radius + (cylinder.external ? lift : -lift),
      depth,
      pitch,
      cylinder.external,
      crestRatio,
    );
    const winding = rightHanded ? 1 : -1;
    const turns = length / lead;
    const perTurn = THREAD_SEGMENTS_PER_TURN;
    const steps = Math.max(6, Math.min(1200, Math.round(perTurn * turns)));
    // Резьба занимает ровно свой участок грани: ядро обрезает свес клина по
    // этим же границам, иначе витки уходили бы за торец (на болте — прямо по
    // шляпке). Призрак обязан показывать ту же длину.
    const zStart = cylinder.start + params.offset;
    const sweep = length;

    const material = threadMaterial();
    const group = new THREE.Group();

    for (let start = 0; start < starts; start += 1) {
      const startAngle = (2 * Math.PI * start) / starts;
      const rings: THREE.Vector3[][] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = (i * turns) / steps;
        const angle = startAngle + winding * 2 * Math.PI * t;
        const along = zStart + (sweep * i) / steps;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        rings.push(
          profile.map(([r, dz]) =>
            origin
              .clone()
              .addScaledVector(axis, along + dz)
              .addScaledVector(u, r * cos)
              .addScaledVector(v, r * sin),
          ),
        );
      }
      group.add(new THREE.Mesh(ribbonGeometry(rings), material));
    }

    if (group.children.length === 0) {
      material.dispose();
      return;
    }
    // Метка для e2e: призрак резьбы отличим от тел сцены (у тех userData.bodyId).
    group.userData.threadPreview = { starts, pitch, depth, external: cylinder.external };
    context.scene().add(group);
    threadGroup = group;
  }

  function hideThread() {
    if (!threadGroup) return;
    context.scene()?.remove(threadGroup);
    disposeObject(threadGroup);
    threadGroup = null;
  }

  return { showExtrude, hideExtrude, showFillet, hideFillet, showThread, hideThread };
}
