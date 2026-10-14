export function summarizeSection(section, withPoints) {
  return {
    plane: section.plane,
    offset: section.offset,
    basis: section.basis,
    bodies: section.bodies.map((body) => ({
      bodyId: body.bodyId,
      name: body.name,
      contours: body.contours.map((contour) =>
        withPoints ? contour : { closed: contour.closed, pointCount: contour.points.length, length: contour.length, area: contour.area, bbox: contour.bbox },
      ),
    })),
  };
}
