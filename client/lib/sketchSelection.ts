import type { WhiteboardElement } from "@shared/types";

const DRAWING_TYPES = new Set([
  "pencil",
  "rectangle",
  "circle",
  "line",
  "arrow",
  "diamond"
]);

function getElementBox(el: WhiteboardElement) {
  if (el.type === "pencil" && el.points && el.points.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of el.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    return { minX, minY, maxX, maxY };
  }

  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

function getBoxCenter(box: { minX: number; minY: number; maxX: number; maxY: number }) {
  return {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2
  };
}

export function pickSketchElements(
  elements: WhiteboardElement[],
  selectedIds: string[] = []
): WhiteboardElement[] {
  if (!elements || elements.length === 0) {
    return [];
  }

  // 1. Selection not empty -> exactly the selected elements
  if (selectedIds && selectedIds.length > 0) {
    const idSet = new Set(selectedIds);
    return elements.filter((el) => idSet.has(el.id));
  }

  // 2. Nothing selected -> cluster around the most recent drawing element
  const drawingElements = elements.filter((el) => DRAWING_TYPES.has(el.type));
  if (drawingElements.length === 0) {
    return [];
  }

  const seedElement = drawingElements[drawingElements.length - 1];
  const cluster: WhiteboardElement[] = [seedElement];
  const remaining = drawingElements.filter((el) => el.id !== seedElement.id);
  const queue: WhiteboardElement[] = [seedElement];
  const MAX_CLUSTER_DISTANCE = 400;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentBox = getElementBox(current);
    const currentCenter = getBoxCenter(currentBox);

    for (let i = remaining.length - 1; i >= 0; i--) {
      const candidate = remaining[i];
      const candidateBox = getElementBox(candidate);
      const candidateCenter = getBoxCenter(candidateBox);

      const distance = Math.hypot(
        currentCenter.x - candidateCenter.x,
        currentCenter.y - candidateCenter.y
      );

      if (distance < MAX_CLUSTER_DISTANCE) {
        cluster.push(candidate);
        queue.push(candidate);
        remaining.splice(i, 1);
      }
    }
  }

  return cluster;
}
