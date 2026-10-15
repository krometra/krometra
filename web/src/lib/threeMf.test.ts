import { describe, expect, it } from "vitest";
import { THREE_MF_MODEL_PATH, threeMfArchive, threeMfModel, weldMesh } from "./threeMf";
import { unzipForTests } from "./unzipForTests";

const quad = {
  name: "Пластина <1> & \"2\"",
  vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
  triangles: [0, 1, 2, 3, 4, 5],
};

describe("weldMesh", () => {
  it("сливает совпадающие вершины соседних треугольников", () => {
    const welded = weldMesh(quad.vertices, quad.triangles);
    expect(welded.vertices).toHaveLength(12);
    expect(welded.triangles).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("сливает вершины, разошедшиеся меньше чем на шаг сварки", () => {
    const welded = weldMesh([0, 0, 0, 1, 0, 0, 0, 1, 0, 1e-7, 0, 0], [0, 1, 2, 3, 1, 2]);
    expect(welded.vertices).toHaveLength(9);
  });

  it("выбрасывает треугольники, выродившиеся после сварки", () => {
    const welded = weldMesh([0, 0, 0, 1e-6, 0, 0, 0, 1, 0, 1, 0, 0], [0, 1, 2, 0, 3, 2]);
    expect(welded.triangles).toEqual([0, 2, 1]);
  });
});

describe("threeMfModel", () => {
  it("пишет модель в миллиметрах с объектом и элементом сборки на каждое тело", () => {
    const xml = threeMfModel([quad, { ...quad, name: "Второе" }]);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"');
    expect(xml.match(/<object /g)).toHaveLength(2);
    expect(xml).toContain('<item objectid="1"/><item objectid="2"/>');
    expect(xml.match(/<triangle /g)).toHaveLength(4);
  });

  it("экранирует имя тела", () => {
    expect(threeMfModel([quad])).toContain('name="Пластина &lt;1&gt; &amp; &quot;2&quot;"');
  });

  it("округляет координаты до микрона без экспоненты", () => {
    const xml = threeMfModel([{ name: "a", vertices: [1 / 3, -0, 1e-9, 2, 0, 0, 0, 2, 0], triangles: [0, 1, 2] }]);
    expect(xml).toContain('<vertex x="0.333333" y="0" z="0"/>');
  });

  it("отказывается собирать пустую модель", () => {
    expect(() => threeMfModel([])).toThrow("Нечего экспортировать");
  });
});

describe("threeMfArchive", () => {
  it("кладёт в архив типы содержимого, связи и модель", async () => {
    const entries = await unzipForTests(await threeMfArchive([quad]));
    expect(entries.map((entry) => entry.name)).toEqual(["[Content_Types].xml", "_rels/.rels", THREE_MF_MODEL_PATH]);
    expect(entries[1].text).toContain(`Target="/${THREE_MF_MODEL_PATH}"`);
    expect(entries[2].text).toBe(threeMfModel([quad]));
  });
});
