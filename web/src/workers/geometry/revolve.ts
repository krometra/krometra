import { browserRevolveFrame } from "@/lib/browserExtrudeFrame";
import { sweepProbes, worldProbes } from "@/lib/browserSweepNaming";
import { namedFromSweep, type NamedShape } from "./naming";
import { sweepSketchProfiles } from "./profile";
import type { RevolveRequest } from "./types";

export function revolveNamed(request: RevolveRequest): NamedShape {
  const { frame, axis, origin } = browserRevolveFrame({ ...request, center: { x: 0, y: 0 } });
  let shape = sweepSketchProfiles(request.entities, (center) => ({
    ...browserRevolveFrame({ ...request, center }).frame,
    sweep: (sketch) => sketch.revolve(axis, { origin, angle: request.angle }),
  }));
  if (request.direction === "symmetric") shape = shape.rotate(-request.angle / 2, origin, axis);
  const probes = worldProbes(sweepProbes(request.entities), frame, { x: 0, y: 0 }, {
    kind: "revolution",
    axisOrigin: origin,
    axis,
    angle: request.angle,
    startAngle: request.direction === "symmetric" ? -request.angle / 2 : 0,
  });
  return namedFromSweep(shape, request.featureKey, probes);
}
