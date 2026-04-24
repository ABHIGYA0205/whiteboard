import type {
  ElementType,
  Point,
  WhiteboardElement
} from "@shared/types";

const HANDLE_SIZE = 10;

// Module-level cache so loaded images persist across render cycles
const imageCache = new Map<string, HTMLImageElement>();

export type ResizeHandle =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export function getNormalizedBounds(element: WhiteboardElement) {
  const x = element.width >= 0 ? element.x : element.x + element.width;
  const y = element.height >= 0 ? element.y : element.y + element.height;
  const width = Math.abs(element.width);
  const height = Math.abs(element.height);

  return { x, y, width, height };
}

export function createElement(
  type: ElementType,
  start: Point,
  color: string,
  strokeWidth: number,
  fillColor: string = "transparent"
): WhiteboardElement {
  return {
    id: crypto.randomUUID(),
    type,
    x: start.x,
    y: start.y,
    width: 0,
    height: 0,
    strokeColor: color,
    fillColor,
    strokeWidth,
    points: type === "pencil" ? [start] : [],
    ...(type === "text" ? { text: "", fontSize: 24 } : {})
  };
}

export function updateElementDraft(
  element: WhiteboardElement,
  point: Point
): WhiteboardElement {
  if (element.type === "pencil") {
    return {
      ...element,
      points: [...element.points, point],
      width: point.x - element.x,
      height: point.y - element.y
    };
  }

  return {
    ...element,
    width: point.x - element.x,
    height: point.y - element.y
  };
}

export function drawElement(
  context: CanvasRenderingContext2D,
  element: WhiteboardElement,
  isSelected: boolean,
  showSelection: boolean
) {
  context.save();
  context.lineWidth = element.strokeWidth;
  context.strokeStyle = element.strokeColor;
  if (element.fillColor && element.fillColor !== "transparent") {
    context.fillStyle = element.fillColor;
  }
  context.lineCap = "round";
  context.lineJoin = "round";

  const bounds = getNormalizedBounds(element);

  if (element.type === "pencil") {
    const [firstPoint, ...rest] = element.points;

    if (firstPoint) {
      context.beginPath();
      context.moveTo(firstPoint.x, firstPoint.y);
      rest.forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    }
  }

  if (element.type === "rectangle") {
    if (element.fillColor && element.fillColor !== "transparent") {
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  if (element.type === "circle") {
    context.beginPath();
    context.ellipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      Math.max(bounds.width / 2, 1),
      Math.max(bounds.height / 2, 1),
      0,
      0,
      Math.PI * 2
    );
    if (element.fillColor && element.fillColor !== "transparent") {
      context.fill();
    }
    context.stroke();
  }

  if (element.type === "line" || element.type === "arrow") {
    context.beginPath();
    context.moveTo(element.x, element.y);
    context.lineTo(element.x + element.width, element.y + element.height);
    context.stroke();

    if (element.type === "arrow") {
      drawArrowHead(
        context,
        { x: element.x, y: element.y },
        { x: element.x + element.width, y: element.y + element.height },
        element.strokeColor,
        element.strokeWidth
      );
    }
  }

  if (element.type === "text") {
    context.font = `${element.fontSize || 24}px "Avenir Next", "Segoe UI", sans-serif`;
    context.fillStyle = element.strokeColor; // text uses strokeColor for the actual text color
    context.textBaseline = "top";
    
    // Split multiline text if any
    const lines = (element.text || "").split("\n");
    const lineHeight = (element.fontSize || 24) * 1.2;
    lines.forEach((line, index) => {
      context.fillText(line, bounds.x, bounds.y + index * lineHeight);
    });
  }

  if (element.type === "image" && element.imageUrl) {
    // We use a cached image approach: store loaded images in a module-level map
    const cached = imageCache.get(element.imageUrl);
    if (cached && cached.complete) {
      context.drawImage(cached, bounds.x, bounds.y, bounds.width, bounds.height);
    } else if (!cached) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = element.imageUrl;
      imageCache.set(element.imageUrl, img);
      img.onload = () => {
        // Force a re-render by dispatching a custom event
        window.dispatchEvent(new CustomEvent("image-loaded"));
      };
    }
  }

  if (isSelected && showSelection) {
    context.strokeStyle = "#f59e0b";
    context.setLineDash([8, 4]);
    // For text we might need a slightly adjusted bounding box depending on exact text rendering, 
    // but the generic one works okay if we update width/height correctly during typing
    context.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
    context.setLineDash([]);

    getResizeHandles(element).forEach((handle) => {
      context.fillStyle = "#111827";
      context.strokeStyle = "#f59e0b";
      context.beginPath();
      context.rect(handle.x, handle.y, HANDLE_SIZE, HANDLE_SIZE);
      context.fill();
      context.stroke();
    });
  }

  context.restore();
}

export function hitTestElement(
  point: Point,
  element: WhiteboardElement
): boolean {
  const bounds = getNormalizedBounds(element);

  if (element.type === "rectangle" || element.type === "circle" || element.type === "text" || element.type === "image") {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  if (element.type === "line" || element.type === "arrow") {
    return distanceToSegment(
      point,
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y + element.height }
    ) < 8;
  }

  if (element.type === "pencil") {
    const threshold = 12;
    return element.points.some((p1, i) => {
      const p2 = element.points[i + 1];
      if (!p2) {
        return Math.hypot(p1.x - point.x, p1.y - point.y) < threshold;
      }
      return distanceToSegment(point, p1, p2) < threshold;
    });
  }

  return false;
}

export function getResizeHandleAtPoint(
  point: Point,
  element: WhiteboardElement
): ResizeHandle | null {
  const handle = getResizeHandles(element).find(
    (candidate) =>
      point.x >= candidate.x &&
      point.x <= candidate.x + HANDLE_SIZE &&
      point.y >= candidate.y &&
      point.y <= candidate.y + HANDLE_SIZE
  );

  return handle?.id ?? null;
}

export function translateElement(
  element: WhiteboardElement,
  deltaX: number,
  deltaY: number
): WhiteboardElement {
  return {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    points:
      element.type === "pencil"
        ? element.points.map((point) => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          }))
        : element.points
  };
}

export function resizeElement(
  element: WhiteboardElement,
  handle: ResizeHandle,
  point: Point
): WhiteboardElement {
  const bounds = getNormalizedBounds(element);
  let nextLeft = bounds.x;
  let nextTop = bounds.y;
  let nextRight = bounds.x + bounds.width;
  let nextBottom = bounds.y + bounds.height;

  if (handle.includes("left")) {
    nextLeft = point.x;
  }

  if (handle.includes("right")) {
    nextRight = point.x;
  }

  if (handle.includes("top")) {
    nextTop = point.y;
  }

  if (handle.includes("bottom")) {
    nextBottom = point.y;
  }

  return {
    ...element,
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
    points:
      element.type === "pencil"
        ? scalePencilPoints(element.points, bounds, {
            x: nextLeft,
            y: nextTop,
            width: nextRight - nextLeft,
            height: nextBottom - nextTop
          })
        : element.points
  };
}

function getResizeHandles(element: WhiteboardElement) {
  const bounds = getNormalizedBounds(element);
  const half = HANDLE_SIZE / 2;

  return [
    { id: "top-left" as const, x: bounds.x - half, y: bounds.y - half },
    {
      id: "top-right" as const,
      x: bounds.x + bounds.width - half,
      y: bounds.y - half
    },
    {
      id: "bottom-left" as const,
      x: bounds.x - half,
      y: bounds.y + bounds.height - half
    },
    {
      id: "bottom-right" as const,
      x: bounds.x + bounds.width - half,
      y: bounds.y + bounds.height - half
    }
  ];
}

function scalePencilPoints(
  points: Point[],
  previous: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number }
) {
  const safeWidth = previous.width || 1;
  const safeHeight = previous.height || 1;

  return points.map((point) => ({
    x: next.x + ((point.x - previous.x) / safeWidth) * (next.width || 1),
    y: next.y + ((point.y - previous.y) / safeHeight) * (next.height || 1)
  }));
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const lengthSquared =
    (end.x - start.x) * (end.x - start.x) +
    (end.y - start.y) * (end.y - start.y);

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * (end.x - start.x) +
        (point.y - start.y) * (end.y - start.y)) /
        lengthSquared
    )
  );

  const projection = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y)
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  strokeWidth: number
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = Math.max(10, strokeWidth * 4);

  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - size * Math.cos(angle - Math.PI / 6),
    end.y - size * Math.sin(angle - Math.PI / 6)
  );
  context.lineTo(
    end.x - size * Math.cos(angle + Math.PI / 6),
    end.y - size * Math.sin(angle + Math.PI / 6)
  );
  context.closePath();
  context.fill();
  context.restore();
}

/**
 * Captures a set of whiteboard elements (typically pencil strokes) into
 * a base64-encoded PNG data URL by drawing them onto an offscreen canvas.
 */
export function exportSelectionToImage(
  elements: WhiteboardElement[]
): string | null {
  if (elements.length === 0) return null;

  // Calculate bounding box across all elements
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const bounds = getNormalizedBounds(el);
    if (el.type === "pencil") {
      for (const pt of el.points) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    } else {
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }
  }

  const padding = 20;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  if (width <= 0 || height <= 0) return null;

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  // White background for the AI model
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Translate so our bounding box starts at (padding, padding)
  ctx.translate(-minX + padding, -minY + padding);

  for (const el of elements) {
    drawElement(ctx, el, false, false);
  }

  return offscreen.toDataURL("image/png");
}

