/**
 * Правильный шестиугольник с целыми координатами вершин.
 *
 * Клик в скетчере попадает в целый экранный пиксель (на рабочем зуме это
 * примерно миллиметр), поэтому вершины всё равно округлятся. Округляем сами
 * и строим зеркально, иначе шестигранник выходит кривым: (8,5) с одной
 * стороны против (-9,-5) с другой.
 *
 * `acrossFlats` — размер «под ключ»: расстояние между парой плоских граней.
 */
export function hexagon(acrossFlats: number): [number, number][] {
  const halfFlat = Math.round(acrossFlats / 2);
  // Вершина на оси Y: у правильного шестиугольника радиус описанной
  // окружности равен 2/√3 от половины размера под ключ.
  const tip = Math.round((halfFlat * 2) / Math.sqrt(3));
  const halfTip = Math.round(tip / 2);
  return [
    [halfFlat, halfTip],
    [0, tip],
    [-halfFlat, halfTip],
    [-halfFlat, -halfTip],
    [0, -tip],
    [halfFlat, -halfTip],
  ];
}

/** Радиус описанной окружности нарисованного шестигранника (его габарит по XY). */
export function hexTip(acrossFlats: number): number {
  return Math.round((Math.round(acrossFlats / 2) * 2) / Math.sqrt(3));
}
