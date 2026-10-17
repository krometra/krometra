import type { GeneratedFaces } from "./browserNaming";

export interface LoftSideFaces {
  key: string | null;
  faces: number[];
}

export function loftGeneratedFaces(sides: LoftSideFaces[], startFace: number, endFace: number): GeneratedFaces[] {
  const caps = new Set([startFace, endFace]);
  const groups = new Map<string, number[]>();
  for (const side of sides) {
    if (side.key === null) continue;
    const key = `side:${side.key}`;
    const images = groups.get(key) ?? [];
    for (const face of side.faces) {
      if (face >= 0 && !caps.has(face) && !images.includes(face)) images.push(face);
    }
    groups.set(key, images);
  }
  const generated = [...groups].map(([key, images]) => ({ key, images }));
  if (startFace >= 0) generated.push({ key: "start", images: [startFace] });
  if (endFace >= 0) generated.push({ key: "end", images: [endFace] });
  return generated;
}
