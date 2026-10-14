import { describe, expect, it } from "vitest";
import { describeBodyTopology, meshStats } from "./topology";
import { A, B, BOX_FACES, C, boxMesh } from "./topologyFixtures";

function ringPolyline(radius: number, z: number, segments: number): number[] {
  const flat: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    flat.push(radius * Math.cos(angle), radius * Math.sin(angle), z);
  }
  flat[flat.length - 3] = radius;
  flat[flat.length - 2] = 0;
  return flat;
}

describe("describeBodyTopology: грани", () => {
  const topology = describeBodyTopology("body-1", boxMesh());
  const face = (id: string) => topology.faces.find((entry) => entry.id === id)!;

  it("перечисляет грани с идентификаторами и рёбрами в виде строк", () => {
    expect(topology.bodyId).toBe("body-1");
    expect(topology.bbox).toEqual({ min: [0, 0, 0], max: [A, B, C] });
    expect(topology.faces.map((entry) => entry.id)).toEqual(Object.keys(BOX_FACES));
    expect(face("top").edgeIds).toEqual(["1", "top-front"]);
  });

  it("считает площадь, центр, нормаль наружу и габарит плоской грани", () => {
    expect(face("top")).toMatchObject({
      triangles: 2,
      area: A * B,
      planar: true,
      normal: [0, 0, 1],
      centroid: [A / 2, B / 2, C],
      bbox: { min: [0, 0, C], max: [A, B, C] },
    });
    expect(face("bottom").normal).toEqual([0, 0, -1]);
    expect(face("front").normal).toEqual([0, -1, 0]);
    expect(face("right").normal).toEqual([1, 0, 0]);
    expect(face("left").area).toBe(B * C);
  });

  it("даёт точку, лежащую на самой грани", () => {
    const point = face("right").point!;
    expect(point[0]).toBe(A);
    expect(point[1]).toBeGreaterThan(0);
    expect(point[1]).toBeLessThan(B);
    expect(point[2]).toBeGreaterThan(0);
    expect(point[2]).toBeLessThan(C);
  });

  it("изогнутую грань не называет плоской и нормаль ей не приписывает", () => {
    const mesh = boxMesh();
    mesh.face_triangle_map = mesh.face_triangle_map.map((id) => (id === "front" ? "top" : id));
    const bent = describeBodyTopology("b", mesh).faces.find((entry) => entry.id === "top")!;
    expect(bent.triangles).toBe(4);
    expect(bent.planar).toBe(false);
    expect(bent.normal).toBeNull();
    expect(bent.area).toBe(A * B + A * C);
  });

  it("грань без треугольников остаётся в списке без геометрии", () => {
    const mesh = boxMesh();
    mesh.brep_topo.faces.push({ face_id: 99, edges: [] });
    const ghost = describeBodyTopology("b", mesh).faces.at(-1)!;
    expect(ghost).toEqual({
      id: "99",
      edgeIds: [],
      triangles: 0,
      area: 0,
      planar: false,
      normal: null,
      centroid: null,
      point: null,
      bbox: null,
    });
  });
});

describe("describeBodyTopology: рёбра", () => {
  it("берёт концы, длину и середину из кривой ребра", () => {
    const [edge] = describeBodyTopology("b", boxMesh()).edges;
    expect(edge).toEqual({ id: "1", start: [0, 0, 0], end: [A, 0, 0], midpoint: [A / 2, 0, 0], length: A, closed: false });
  });

  it("без кривой собирает ребро по индексам вершин меша", () => {
    const edge = describeBodyTopology("b", boxMesh()).edges[1];
    expect(edge).toMatchObject({ id: "top-front", start: [0, 0, C], end: [A, 0, C], length: A });
  });

  it("середина ломаной считается по длине пути, а не по номеру точки", () => {
    const mesh = boxMesh();
    mesh.brep_topo.edges = [{ edge_id: "L", vertices: [], polyline: [0, 0, 0, 1, 0, 0, 1, 9, 0] }];
    const [edge] = describeBodyTopology("b", mesh).edges;
    expect(edge.length).toBe(10);
    expect(edge.midpoint).toEqual([1, 4, 0]);
  });

  it("замкнутую кромку помечает closed и меряет по окружности", () => {
    const mesh = boxMesh();
    mesh.brep_topo.edges = [{ edge_id: "rim", vertices: [], polyline: ringPolyline(5, C, 180) }];
    const [edge] = describeBodyTopology("b", mesh).edges;
    expect(edge.closed).toBe(true);
    expect(edge.start).toEqual(edge.end);
    expect(edge.length).toBeCloseTo(2 * Math.PI * 5, 2);
    expect(edge.midpoint[0]).toBeCloseTo(-5, 6);
  });

  it("кривую целиком отдаёт только по запросу", () => {
    expect(describeBodyTopology("b", boxMesh()).edges[0].polyline).toBeUndefined();
    expect(describeBodyTopology("b", boxMesh(), { polylines: true }).edges[0].polyline).toEqual([
      [0, 0, 0],
      [A, 0, 0],
    ]);
  });

  it("ребро без единой точки пропускает", () => {
    const mesh = boxMesh();
    mesh.brep_topo.edges = [{ edge_id: "void", vertices: [] }];
    expect(describeBodyTopology("b", mesh).edges).toEqual([]);
  });
});

describe("meshStats", () => {
  it("у замкнутого тела открытых рёбер нет", () => {
    expect(meshStats(boxMesh())).toEqual({ vertices: 24, triangles: 12, openEdges: 0, zLevels: [0, C] });
  });

  it("дыра в один треугольник даёт три открытых ребра", () => {
    const mesh = boxMesh();
    mesh.indices = mesh.indices.slice(3);
    mesh.face_triangle_map = mesh.face_triangle_map.slice(1);
    const stats = meshStats(mesh);
    expect(stats.triangles).toBe(11);
    expect(stats.openEdges).toBe(3);
  });

  it("уровни по Z округляются до сотых и идут по возрастанию", () => {
    const mesh = boxMesh();
    mesh.vertices = mesh.vertices.map((value, index) => (index % 3 === 2 && value === C ? 2.004 : value));
    mesh.vertices[2] = -1.5;
    expect(meshStats(mesh).zLevels).toEqual([-1.5, 0, 2]);
  });
});
