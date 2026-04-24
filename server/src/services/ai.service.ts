import type { Point, WhiteboardElement } from "@shared/types";

export function autoCleanElements(elements: WhiteboardElement[]) {
  return elements.map((element) => {
    if (element.type !== "pencil" || element.points.length < 6) {
      return element;
    }

    if (isLineLike(element.points)) {
      const first = element.points[0];
      const last = element.points[element.points.length - 1];
      return {
        ...element,
        type: "line" as const,
        x: first.x,
        y: first.y,
        width: last.x - first.x,
        height: last.y - first.y,
        points: []
      };
    }

    const bounds = getBounds(element.points);
    if (isRectangleLike(element.points, bounds)) {
      return {
        ...element,
        type: "rectangle" as const,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        points: []
      };
    }

    if (isCircleLike(element.points, bounds)) {
      return {
        ...element,
        type: "circle" as const,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        points: []
      };
    }

    return element;
  });
}

function getBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function isLineLike(points: Point[]) {
  const first = points[0];
  const last = points[points.length - 1];
  const directDistance = Math.hypot(last.x - first.x, last.y - first.y);
  const traveled = points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);

  return directDistance > 20 && traveled / directDistance < 1.18;
}

function isRectangleLike(
  points: Point[],
  bounds: { x: number; y: number; width: number; height: number }
) {
  const closed = areEndpointsClose(points);
  if (!closed || bounds.width < 16 || bounds.height < 16) {
    return false;
  }

  const tolerance = Math.max(bounds.width, bounds.height) * 0.12;
  const edgeAligned = points.filter((point) => {
    const onLeft = Math.abs(point.x - bounds.x) <= tolerance;
    const onRight = Math.abs(point.x - (bounds.x + bounds.width)) <= tolerance;
    const onTop = Math.abs(point.y - bounds.y) <= tolerance;
    const onBottom = Math.abs(point.y - (bounds.y + bounds.height)) <= tolerance;
    return onLeft || onRight || onTop || onBottom;
  });

  return edgeAligned.length / points.length > 0.82;
}

function isCircleLike(
  points: Point[],
  bounds: { x: number; y: number; width: number; height: number }
) {
  const closed = areEndpointsClose(points);
  if (!closed || bounds.width < 16 || bounds.height < 16) {
    return false;
  }

  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
  const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const variance =
    radii.reduce((sum, radius) => sum + Math.pow(radius - averageRadius, 2), 0) /
    radii.length;

  return Math.sqrt(variance) < averageRadius * 0.18;
}

function areEndpointsClose(points: Point[]) {
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < 18;
}
