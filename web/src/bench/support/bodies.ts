import { generatedFaceName } from "@/lib/browserNaming";
import { circle, edgeNames, extrudeRequest, rectangle, type WorkerReply } from "@/workers/testing/workerHarness";
import { retain } from "./kernel";
import { perforatedPlate, plateSide, slabOutline } from "./sketches";

export const PLATE_HEIGHT = 10;
export const REFERENCE_HOLES = 16;
export const REFERENCE_SIDE = plateSide(REFERENCE_HOLES);

const TOLERANCE = 1e-6;
const TOOL_FROM = REFERENCE_SIDE / 4;
const TOOL_TO = (REFERENCE_SIDE * 3) / 4;

type Point = [number, number, number];

function polylinePoints(flat: number[]): Point[] {
  const points: Point[] = [];
  for (let index = 0; index + 2 < flat.length; index += 3) points.push([flat[index], flat[index + 1], flat[index + 2]]);
  return points;
}

function edgesWhere(reply: WorkerReply, matches: (points: Point[]) => boolean): string[] {
  return (reply.mesh?.brep_topo.edges ?? [])
    .filter((edge) => matches(polylinePoints(edge.polyline ?? [])))
    .map((edge) => String(edge.edge_id));
}

const near = (a: number, b: number) => Math.abs(a - b) < TOLERANCE;

export function cornerEdges(reply: WorkerReply, side: number): string[] {
  const onCorner = (value: number) => near(value, 0) || near(value, side);
  return edgesWhere(reply, (points) => {
    const [first, last] = [points[0], points[points.length - 1]];
    return onCorner(first[0]) && onCorner(first[1]) && near(first[0], last[0]) && near(first[1], last[1]) && !near(first[2], last[2]);
  });
}

export function topRimEdges(reply: WorkerReply, height: number): string[] {
  return edgesWhere(reply, (points) => points.length > 2 && points.every((point) => near(point[2], height)));
}

export function boxRequest(featureKey: string) {
  return extrudeRequest([rectangle("box", 0, 0, 20, 10)], featureKey);
}

export async function retainBox(bodyId: string) {
  return { edges: edgeNames(await retain(boxRequest(`k-${bodyId}`), bodyId)) };
}

export function retainSlab(bodyId: string, side: number) {
  return retain(extrudeRequest(slabOutline(side), `k-${bodyId}`, { distance: PLATE_HEIGHT }), bodyId);
}

export async function retainPlate(bodyId: string) {
  const reply = await retain(extrudeRequest(perforatedPlate(REFERENCE_HOLES), `k-${bodyId}`, { distance: PLATE_HEIGHT }), bodyId);
  return { corners: cornerEdges(reply, REFERENCE_SIDE), rims: topRimEdges(reply, PLATE_HEIGHT) };
}

export async function retainTool(bodyId: string) {
  const tool = [rectangle("tool", TOOL_FROM, TOOL_FROM, TOOL_TO, TOOL_TO)];
  await retain(extrudeRequest(tool, `k-${bodyId}`, { planeOffset: PLATE_HEIGHT / 2, distance: 20 }), bodyId);
}

export async function retainRod(bodyId: string) {
  const featureKey = `k-${bodyId}`;
  await retain(extrudeRequest([circle("rod", 0, 0, 5)], featureKey, { distance: 20 }), bodyId);
  return { threadFace: generatedFaceName(featureKey, "side:rod") };
}

export async function retainPart(bodyId: string) {
  const blank = `${bodyId}-blank`;
  const { corners } = await retainPlate(blank);
  return retain({ kind: "fillet", bodyId: blank, featureKey: `k-${bodyId}`, edgeNames: corners, radius: 2 }, bodyId);
}
