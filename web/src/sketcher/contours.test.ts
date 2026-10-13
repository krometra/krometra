import { describe, expect, it } from "vitest";
import { profileContours, profileFaces } from "./contours";
import type { SketchEntity, SketchLine } from "@/types/api";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

const circle = (id: string, x: number, y: number, radius: number): SketchEntity => ({
  id,
  type: "circle",
  center: { x, y },
  radius,
});

const square = (side: number): SketchEntity[] => {
  const c = [
    [0, 0],
    [side, 0],
    [side, side],
    [0, side],
  ];
  return c.map((_, i) => line(`l${i}`, c[i][0], c[i][1], c[(i + 1) % 4][0], c[(i + 1) % 4][1]));
};

describe("profileContours", () => {
  it("собирает замкнутую цепочку линий в один контур независимо от порядка", () => {
    const shuffled = [square(10)[2], square(10)[0], square(10)[3], square(10)[1]];
    const contours = profileContours(shuffled);
    expect(contours).toHaveLength(1);
    expect(contours[0]).toHaveLength(4);
  });

  it("каждая окружность — свой контур", () => {
    expect(profileContours([circle("c1", 0, 0, 3), circle("c2", 20, 0, 3)])).toHaveLength(2);
  });

  it("вспомогательная геометрия контуром не считается", () => {
    const entities: SketchEntity[] = [
      ...square(10),
      { ...(line("aux", 0, 0, 50, 50) as SketchLine), construction: true },
      { id: "inf", type: "infline", point: { x: 0, y: 0 }, angle: 1.57 },
    ];
    expect(profileContours(entities)).toHaveLength(1);
  });
});

describe("profileFaces", () => {
  it("несвязанные контуры дают отдельные грани без отверстий", () => {
    const faces = profileFaces([circle("c1", 0, 0, 3), circle("c2", 20, 0, 3)]);
    expect(faces).toHaveLength(2);
    expect(faces.every((f) => f.holes.length === 0)).toBe(true);
  });

  it("вложенный контур становится отверстием", () => {
    const faces = profileFaces([...square(40), circle("c", 20, 20, 5)]);
    expect(faces).toHaveLength(1);
    expect(faces[0].holes).toHaveLength(1);
  });

  it("остров внутри отверстия снова грань", () => {
    const faces = profileFaces([
      circle("outer", 0, 0, 30),
      circle("hole", 0, 0, 20),
      circle("island", 0, 0, 10),
    ]);
    expect(faces).toHaveLength(2);
    expect(faces.flatMap((f) => f.holes)).toHaveLength(1);
  });
});
