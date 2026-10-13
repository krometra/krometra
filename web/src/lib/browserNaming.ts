export type Fingerprint = [number, number, number, number];

export interface TopologySnapshot {
  faces: Fingerprint[];
  edges: { faces: number[]; fingerprint: Fingerprint }[];
}

export interface BodyNaming {
  faces: string[];
  edges: string[];
}

export interface FaceLineage {
  names: string[];
  images: number[][];
}

export interface GeneratedFaces {
  key: string;
  images: number[];
}

export interface SavedNaming {
  version: 1;
  faces: { name: string; fingerprint: Fingerprint }[];
}

const FINGERPRINT_TOLERANCE = 1e-5;

export function stableHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function generatedFaceName(featureKey: string, key: string): string {
  return `f-${stableHash(`${featureKey}/${key}`)}`;
}

export function isStableFaceName(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("f-") && value.length > 2;
}

function splitName(name: string, part: number): string {
  return part === 0 ? name : `${name}~${part}`;
}

export function nameFaces(input: {
  featureKey: string;
  faceCount: number;
  lineages: FaceLineage[];
  generated: GeneratedFaces[];
}): string[] {
  const names: (string | null)[] = Array(input.faceCount).fill(null);
  const used = new Set<string>();
  const claim = (face: number, name: string) => {
    if (face < 0 || face >= names.length || names[face] !== null || used.has(name)) return;
    names[face] = name;
    used.add(name);
  };
  for (const lineage of input.lineages) {
    lineage.names.forEach((name, index) => {
      (lineage.images[index] ?? []).forEach((face, part) => claim(face, splitName(name, part)));
    });
  }
  for (const generated of input.generated) {
    const name = generatedFaceName(input.featureKey, generated.key);
    generated.images.forEach((face, part) => claim(face, splitName(name, part)));
  }
  let ordinal = 0;
  return names.map((name) => {
    if (name !== null) return name;
    let fallback = generatedFaceName(input.featureKey, `n${ordinal++}`);
    while (used.has(fallback)) fallback = generatedFaceName(input.featureKey, `n${ordinal++}`);
    used.add(fallback);
    return fallback;
  });
}

function compareFingerprints(a: Fingerprint, b: Fingerprint): number {
  for (let index = 0; index < a.length; index++) {
    if (Math.abs(a[index] - b[index]) > FINGERPRINT_TOLERANCE) return a[index] - b[index];
  }
  return 0;
}

export function edgeKey(faceNames: string[]): string {
  return [...faceNames].sort().join("|");
}

export function nameEdges(snapshot: TopologySnapshot, faceNames: string[]): string[] {
  const groups = new Map<string, number[]>();
  snapshot.edges.forEach((edge, index) => {
    const key = edgeKey(edge.faces.map((face) => faceNames[face] ?? `?${face}`));
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  const names: string[] = Array(snapshot.edges.length).fill("");
  for (const [key, indices] of groups) {
    const ordered = [...indices].sort((a, b) => compareFingerprints(snapshot.edges[a].fingerprint, snapshot.edges[b].fingerprint));
    ordered.forEach((edge, ordinal) => {
      names[edge] = `e-${stableHash(ordinal === 0 ? key : `${key}#${ordinal}`)}`;
    });
  }
  return names;
}

export function nameBody(input: Parameters<typeof nameFaces>[0], snapshot: TopologySnapshot): BodyNaming {
  const faces = nameFaces(input);
  return { faces, edges: nameEdges(snapshot, faces) };
}

export function fingerprintsMatch(a: Fingerprint, b: Fingerprint): boolean {
  const scale = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
  return a.every((value, index) => Math.abs(value - b[index]) <= FINGERPRINT_TOLERANCE * scale);
}

export function uniqueFingerprintMatch(target: Fingerprint, candidates: Fingerprint[], taken: Set<number>): number {
  const matches = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate, index }) => !taken.has(index) && fingerprintsMatch(target, candidate));
  return matches.length === 1 ? matches[0].index : -1;
}

export function saveNaming(snapshot: TopologySnapshot, naming: BodyNaming): SavedNaming {
  return {
    version: 1,
    faces: naming.faces.map((name, index) => ({ name, fingerprint: snapshot.faces[index] })),
  };
}

export function restoreNaming(saved: SavedNaming | null, snapshot: TopologySnapshot, fallbackKey: string): BodyNaming {
  const savedFaces = saved?.faces ?? [];
  const sameOrder = savedFaces.length === snapshot.faces.length
    && savedFaces.every((face, index) => fingerprintsMatch(face.fingerprint, snapshot.faces[index]));
  const images = sameOrder
    ? savedFaces.map((_, index) => [index])
    : restoredImages(savedFaces.map((face) => face.fingerprint), snapshot.faces);
  return nameBody({
    featureKey: fallbackKey,
    faceCount: snapshot.faces.length,
    lineages: [{ names: savedFaces.map((face) => face.name), images }],
    generated: [],
  }, snapshot);
}

function restoredImages(saved: Fingerprint[], current: Fingerprint[]): number[][] {
  const taken = new Set<number>();
  return saved.map((fingerprint) => {
    const match = uniqueFingerprintMatch(fingerprint, current, taken);
    if (match < 0) return [];
    taken.add(match);
    return [match];
  });
}

export function resolveNames(names: string[], requested: string[], kind: "грань" | "ребро"): number[] {
  const index = new Map(names.map((name, position) => [name, position]));
  return requested.map((name) => {
    const position = index.get(name);
    if (position === undefined) throw new Error(`${kind === "ребро" ? "Ребро" : "Грань"} «${name}» больше не существует в теле.`);
    return position;
  });
}

export function isSavedNaming(value: unknown): value is SavedNaming {
  if (!value || typeof value !== "object") return false;
  const naming = value as { version?: unknown; faces?: unknown };
  return naming.version === 1 && Array.isArray(naming.faces) && naming.faces.every((face) => (
    typeof face?.name === "string"
    && Array.isArray(face.fingerprint)
    && face.fingerprint.length === 4
    && face.fingerprint.every((value: unknown) => typeof value === "number" && Number.isFinite(value))
  ));
}
