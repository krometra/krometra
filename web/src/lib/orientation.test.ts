import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  CANONICAL_VIEWS,
  ISO_VIEW,
} from "@/composables/useViewCube";
import { createGrid, projectAxes, toCubeSpace, WORLD_UP } from "./orientation";

/**
 * Сцена обязана совпадать с геометрическим ядром (Z-up). Расхождение уже давало
 * баг «эскиз на горизонтальной плоскости → деталь на боку в экспорте».
 */
describe("ориентация сцены Z-up", () => {
  it("мировой верх — +Z", () => {
    expect([WORLD_UP.x, WORLD_UP.y, WORLD_UP.z]).toEqual([0, 0, 1]);
  });

  it("сетка лежит в плоскости XY, а не в XZ", () => {
    const grid = createGrid(20, 20);
    const normal = new THREE.Vector3(0, 1, 0).applyEuler(grid.rotation);
    expect(Math.abs(normal.z)).toBeCloseTo(1, 6);
    expect(Math.abs(normal.y)).toBeCloseTo(0, 6);
  });
});

describe("CANONICAL_VIEWS", () => {
  it("«Верх» смотрит вдоль -Z с высоты, а не сбоку", () => {
    const { position } = CANONICAL_VIEWS.top;
    expect(position.z).toBeGreaterThan(0);
    expect(position.x).toBeCloseTo(0, 6);
    expect(position.y).toBeCloseTo(0, 6);
  });

  it("боковые виды держат верхом мировой +Z — модель не встаёт вверх ногами", () => {
    for (const name of ["front", "back", "left", "right"]) {
      const { up } = CANONICAL_VIEWS[name];
      expect([up.x, up.y, up.z], name).toEqual([0, 0, 1]);
    }
  });

  it("up не коллинеарен направлению взгляда ни в одном виде", () => {
    for (const [name, view] of Object.entries({ ...CANONICAL_VIEWS, iso: ISO_VIEW })) {
      const dir = view.position.clone().sub(view.target).normalize();
      expect(Math.abs(dir.dot(view.up.clone().normalize())), name).toBeLessThan(0.999);
    }
  });

  it("«Спереди» и «Сзади» смотрят с противоположных сторон", () => {
    const f = CANONICAL_VIEWS.front.position;
    const b = CANONICAL_VIEWS.back.position;
    expect(f.clone().add(b).length()).toBeCloseTo(0, 6);
  });

  it("изометрия смотрит сверху и в стороне от осей", () => {
    expect(ISO_VIEW.position.z).toBeGreaterThan(0);
    expect(Math.abs(ISO_VIEW.position.x)).toBeGreaterThan(1);
    expect(Math.abs(ISO_VIEW.position.y)).toBeGreaterThan(1);
  });
});

describe("toCubeSpace (мир Z-up → CSS-куб Y-up)", () => {
  it("мировой верх становится верхом куба", () => {
    const v = toCubeSpace(new THREE.Vector3(0, 0, 1));
    expect(v.distanceTo(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0, 6);
  });

  it("взгляд «спереди» (камера с -Y) даёт +Z куба — грань FRONT к зрителю", () => {
    const v = toCubeSpace(new THREE.Vector3(0, -1, 0));
    expect(v.distanceTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0, 6);
  });

  it("длина вектора сохраняется: это поворот осей, а не искажение", () => {
    const src = new THREE.Vector3(3, -4, 12);
    expect(toCubeSpace(src).length()).toBeCloseTo(src.length(), 6);
  });
});

describe("projectAxes", () => {
  const eye = new THREE.Vector3(0, -10, 0);
  const target = new THREE.Vector3(0, 0, 0);

  it("при взгляде спереди Z идёт вверх экрана, X вправо", () => {
    const axes = projectAxes(eye, target, WORLD_UP, 26);
    const byName = Object.fromEntries(axes.map((a) => [a.name, a]));
    expect(byName.Z.dy).toBeLessThan(0); // экранный y растёт вниз
    expect(byName.Z.dx).toBeCloseTo(0, 6);
    expect(byName.X.dx).toBeGreaterThan(0);
  });

  it("ось от зрителя рисуется первой, чтобы её перекрыли ближние", () => {
    const axes = projectAxes(eye, target, WORLD_UP, 26);
    expect(axes[0].name).toBe("Y"); // взгляд вдоль +Y
    expect(axes[0].depth).toBeGreaterThan(axes[axes.length - 1].depth);
  });

  it("следит за камерой: с другого ракурса проекция другая", () => {
    const a = projectAxes(eye, target, WORLD_UP, 26);
    const b = projectAxes(new THREE.Vector3(10, 0, 0), target, WORLD_UP, 26);
    expect(a.map((x) => x.name).join()).not.toBe(b.map((x) => x.name).join());
  });

  it("длина оси задаётся аргументом", () => {
    const axes = projectAxes(eye, target, WORLD_UP, 26);
    const z = axes.find((a) => a.name === "Z")!;
    expect(Math.hypot(z.dx, z.dy)).toBeCloseTo(26, 6);
  });
});
