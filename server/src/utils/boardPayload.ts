import type { Point, WhiteboardElement } from "@shared/types";

const elementTypes = new Set([
  "pencil", "rectangle", "diamond", "circle", "ellipse", "line", "arrow", "text", "image", "sticky"
]);

export function isElementId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const { x, y } = value as Point;
  return Number.isFinite(x) && Number.isFinite(y);
}

export function isBoardElement(value: unknown): value is WhiteboardElement {
  if (!isPoint(value)) return false;
  const element = value as WhiteboardElement;
  return isElementId(element.id) && elementTypes.has(element.type) &&
    [element.width, element.height, element.strokeWidth].every(Number.isFinite) &&
    typeof element.strokeColor === "string" && element.strokeColor.length > 0 &&
    (element.points === undefined || (Array.isArray(element.points) && element.points.every(isPoint))) &&
    [element.strokeStyle, element.fillColor, element.fillStyle, element.imageUrl, element.text]
      .every((field) => field === undefined || typeof field === "string") &&
    [element.roughness, element.opacity, element.fontSize, element.z]
      .every((field) => field === undefined || Number.isFinite(field));
}
