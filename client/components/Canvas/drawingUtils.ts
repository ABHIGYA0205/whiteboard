import type {
  ElementType,
  Point,
  WhiteboardElement
} from "@shared/types";
import { resolveImageUrl } from "@/lib/api";

const HANDLE_SIZE = 12;

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
  let width = Math.abs(element.width);
  let height = Math.abs(element.height);

  if (element.type === "text") {
    const fontSize = element.fontSize || 24;
    const lines = (element.text || " ").split("\n");
    const maxLineLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
    width = Math.max(width, maxLineLen * (fontSize * 0.62), 60);
    height = Math.max(height, lines.length * (fontSize * 1.25), fontSize);
  }

  if (element.type === "sticky" && element.text) {
    const fontSize = element.fontSize || 18;
    const padding = 16;
    const maxWidth = Math.max(width - padding * 2, 80);
    const lineHeight = fontSize * 1.35;
    const paragraphs = element.text.split("\n");
    let totalLines = 0;
    for (const para of paragraphs) {
      const charPerLine = Math.max(Math.floor(maxWidth / (fontSize * 0.55)), 1);
      totalLines += Math.max(Math.ceil((para.length || 1) / charPerLine), 1);
    }
    const neededHeight = padding * 2 + totalLines * lineHeight + 16;
    height = Math.max(height, neededHeight);
  }

  return { x, y, width, height };
}

export function createElement(
  type: ElementType,
  start: Point,
  color: string,
  strokeWidth: number,
  fillColor: string = "transparent",
  options?: {
    strokeStyle?: "solid" | "dashed" | "dotted";
    fillStyle?: "transparent" | "semi" | "solid";
    roughness?: number;
    roundness?: boolean;
    opacity?: number;
  }
): WhiteboardElement {
  const isSticky = type === "sticky";
  return {
    id: crypto.randomUUID(),
    type,
    x: start.x,
    y: start.y,
    width: isSticky ? 200 : 0,
    height: isSticky ? 200 : 0,
    strokeColor: isSticky ? "#ca8a04" : color,
    fillColor: isSticky ? "#fef08a" : fillColor,
    strokeWidth: isSticky ? 1 : strokeWidth,
    strokeStyle: options?.strokeStyle || "solid",
    fillStyle: options?.fillStyle || (fillColor !== "transparent" ? "solid" : "transparent"),
    roughness: options?.roughness ?? 0,
    roundness: options?.roundness ?? false,
    opacity: options?.opacity ?? 1,
    points: type === "pencil" ? [start] : [],
    ...(type === "text" || isSticky ? { text: "", fontSize: isSticky ? 18 : 24 } : {})
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

export function getContrastStrokeColor(color: string, theme: "dark" | "light" = "dark"): string {
  if (!color) return theme === "light" ? "#1e293b" : "#ececf1";
  const normalized = color.toLowerCase().trim();
  if (theme === "light") {
    // If color is very light on light canvas background, map to dark slate for high contrast
    if (
      normalized === "#ececf1" ||
      normalized === "#ffffff" ||
      normalized === "#fff" ||
      normalized === "#f1f5f9" ||
      normalized === "#f8fafc" ||
      normalized === "white"
    ) {
      return "#1e293b";
    }
  } else {
    // If color is very dark on dark canvas background, map to light grey
    if (
      normalized === "#1e293b" ||
      normalized === "#0f172a" ||
      normalized === "#000000" ||
      normalized === "#000" ||
      normalized === "#18181b" ||
      normalized === "black"
    ) {
      return "#ececf1";
    }
  }
  return color;
}

export function drawElement(
  context: CanvasRenderingContext2D,
  element: WhiteboardElement,
  isSelected: boolean,
  showSelection: boolean,
  theme: "dark" | "light" = "dark"
) {
  const effectiveStrokeColor = getContrastStrokeColor(element.strokeColor, theme);
  context.save();

  if (typeof element.opacity === "number") {
    context.globalAlpha = Math.max(0, Math.min(1, element.opacity));
  }

  context.lineWidth = element.strokeWidth;
  context.strokeStyle = effectiveStrokeColor;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (element.strokeStyle === "dashed") {
    context.setLineDash([element.strokeWidth * 4 + 2, element.strokeWidth * 3 + 2]);
  } else if (element.strokeStyle === "dotted") {
    context.setLineDash([element.strokeWidth, element.strokeWidth * 2 + 2]);
  } else {
    context.setLineDash([]);
  }

  const hasFill = element.fillColor && element.fillColor !== "transparent";
  const bounds = getNormalizedBounds(element);

  const applyFill = (pathCallback?: () => void) => {
    if (!hasFill) return;
    context.save();
    if (element.fillStyle === "semi") {
      context.globalAlpha = (context.globalAlpha || 1) * 0.35;
    }
    context.fillStyle = element.fillColor!;
    if (pathCallback) {
      pathCallback();
    } else {
      context.fill();
    }
    context.restore();
  };

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
    const isRounded = Boolean(element.roundness);
    const radius = isRounded ? Math.min(16, bounds.width / 4, bounds.height / 4) : 0;

    context.beginPath();
    if (radius > 0 && typeof context.roundRect === "function") {
      context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
    } else {
      context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    if (hasFill) {
      applyFill();
    }
    context.stroke();

    if (element.text) {
      drawShapeText(context, element.text, bounds, effectiveStrokeColor, element.fontSize || 16);
    }
  }

  if (element.type === "diamond") {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    context.beginPath();
    context.moveTo(cx, bounds.y);
    context.lineTo(bounds.x + bounds.width, cy);
    context.lineTo(cx, bounds.y + bounds.height);
    context.lineTo(bounds.x, cy);
    context.closePath();

    if (hasFill) {
      applyFill();
    }
    context.stroke();

    if (element.text) {
      drawShapeText(context, element.text, bounds, effectiveStrokeColor, element.fontSize || 16);
    }
  }

  if (element.type === "circle" || element.type === "ellipse") {
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
    if (hasFill) {
      applyFill();
    }
    context.stroke();
    if (element.text) {
      drawShapeText(context, element.text, bounds, effectiveStrokeColor, element.fontSize || 16);
    }
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
        effectiveStrokeColor,
        element.strokeWidth
      );
    }
  }

  if (element.type === "text") {
    context.font = `${element.fontSize || 24}px "Avenir Next", "Segoe UI", sans-serif`;
    context.fillStyle = effectiveStrokeColor; // text uses strokeColor for the actual text color
    context.textBaseline = "top";
    
    // Split multiline text if any
    const lines = (element.text || "").split("\n");
    const lineHeight = (element.fontSize || 24) * 1.2;
    lines.forEach((line, index) => {
      context.fillText(line, bounds.x, bounds.y + index * lineHeight);
    });
  }

  if (element.type === "sticky") {
    const radius = 8;
    const noteBg = element.fillColor && element.fillColor !== "transparent" ? element.fillColor : "#fef08a";
    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.25)";
    context.shadowBlur = 10;
    context.shadowOffsetY = 4;
    context.fillStyle = noteBg;
    context.beginPath();
    context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
    context.fill();
    context.restore();

    context.strokeStyle = element.strokeColor || "rgba(0, 0, 0, 0.1)";
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
    context.stroke();

    if (element.text) {
      context.save();
      context.beginPath();
      context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
      context.clip();

      context.font = `${element.fontSize || 18}px "Inter", "Segoe UI", sans-serif`;
      context.fillStyle = "#1e293b";
      context.textBaseline = "top";
      const padding = 16;
      const maxWidth = bounds.width - padding * 2;
      const lineHeight = (element.fontSize || 18) * 1.3;

      const paragraphs = element.text.split("\n");
      let y = bounds.y + padding;

      for (const para of paragraphs) {
        const words = para.split(" ");
        let currentLine = "";
        for (let n = 0; n < words.length; n++) {
          const testLine = currentLine ? `${currentLine} ${words[n]}` : words[n];
          const metrics = context.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            context.fillText(currentLine, bounds.x + padding, y);
            currentLine = words[n];
            y += lineHeight;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          context.fillText(currentLine, bounds.x + padding, y);
          y += lineHeight;
        }
      }
      context.restore();
    }
  }

  if (element.type === "image") {
    if (!element.imageUrl) {
      context.save();
      context.fillStyle = theme === "light" ? "rgba(239, 68, 68, 0.05)" : "rgba(239, 68, 68, 0.1)";
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.strokeStyle = "rgba(239, 68, 68, 0.35)";
      context.lineWidth = 1.5;
      context.setLineDash([4, 4]);
      context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.setLineDash([]);
      context.fillStyle = theme === "light" ? "#dc2626" : "#fca5a5";
      context.font = "12px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("Image unavailable", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      context.restore();
    } else {
      const resolvedUrl = resolveImageUrl(element.imageUrl);
      const cached = imageCache.get(resolvedUrl);
      if (cached && cached.complete && cached.naturalWidth > 0 && cached.naturalHeight > 0) {
        try {
          context.drawImage(cached, bounds.x, bounds.y, bounds.width, bounds.height);
        } catch {
          // Fallback gracefully if image enters broken state during rendering
          context.save();
          context.fillStyle = theme === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)";
          context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
          context.strokeStyle = "rgba(239, 68, 68, 0.4)";
          context.lineWidth = 1.5;
          context.setLineDash([4, 4]);
          context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
          context.setLineDash([]);
          context.restore();
        }
      } else if (cached && cached.complete && (cached.naturalWidth === 0 || cached.naturalHeight === 0)) {
        // Image failed to load or is in broken state
        context.save();
        context.fillStyle = theme === "light" ? "rgba(239, 68, 68, 0.05)" : "rgba(239, 68, 68, 0.1)";
        context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.strokeStyle = "rgba(239, 68, 68, 0.35)";
        context.lineWidth = 1.5;
        context.setLineDash([4, 4]);
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.setLineDash([]);
        context.fillStyle = theme === "light" ? "#dc2626" : "#fca5a5";
        context.font = "12px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("Image unavailable", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        context.restore();
      } else if (!cached) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = resolvedUrl;
        imageCache.set(resolvedUrl, img);
        img.onload = () => {
          window.dispatchEvent(new CustomEvent("image-loaded"));
        };
        img.onerror = () => {
          // Retry once without crossOrigin in case CORS headers are absent
          if (img.crossOrigin) {
            const retryImg = new Image();
            retryImg.src = resolvedUrl;
            imageCache.set(resolvedUrl, retryImg);
            retryImg.onload = () => {
              window.dispatchEvent(new CustomEvent("image-loaded"));
            };
            retryImg.onerror = () => {
              window.dispatchEvent(new CustomEvent("image-loaded"));
            };
            return;
          }
          window.dispatchEvent(new CustomEvent("image-loaded"));
        };

        // Loading skeleton
        context.save();
        context.fillStyle = theme === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)";
        context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.strokeStyle = theme === "light" ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";
        context.lineWidth = 1;
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.restore();
      } else {
        // Still loading
        context.save();
        context.fillStyle = theme === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)";
        context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.strokeStyle = theme === "light" ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";
        context.lineWidth = 1;
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.restore();
      }
    }
  }

  if (isSelected && showSelection) {
    context.strokeStyle = "#3b82f6";
    context.lineWidth = 1.5;
    context.setLineDash([5, 3]);
    context.strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
    context.setLineDash([]);

    getResizeHandles(element).forEach((handle) => {
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#3b82f6";
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(handle.x, handle.y, HANDLE_SIZE, HANDLE_SIZE, 3);
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
  const pad = 10;

  if (
    element.type === "rectangle" ||
    element.type === "diamond" ||
    element.type === "circle" ||
    element.type === "text" ||
    element.type === "image" ||
    element.type === "sticky"
  ) {
    return (
      point.x >= bounds.x - pad &&
      point.x <= bounds.x + bounds.width + pad &&
      point.y >= bounds.y - pad &&
      point.y <= bounds.y + bounds.height + pad
    );
  }

  if (element.type === "line" || element.type === "arrow") {
    return distanceToSegment(
      point,
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y + element.height }
    ) < 16;
  }

  if (element.type === "pencil") {
    const threshold = 16;
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
  const grabPad = 5;
  const handle = getResizeHandles(element).find(
    (candidate) =>
      point.x >= candidate.x - grabPad &&
      point.x <= candidate.x + HANDLE_SIZE + grabPad &&
      point.y >= candidate.y - grabPad &&
      point.y <= candidate.y + HANDLE_SIZE + grabPad
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
    nextLeft = Math.min(point.x, nextRight - 15);
  }

  if (handle.includes("right")) {
    nextRight = Math.max(point.x, nextLeft + 15);
  }

  if (handle.includes("top")) {
    nextTop = Math.min(point.y, nextBottom - 15);
  }

  if (handle.includes("bottom")) {
    nextBottom = Math.max(point.y, nextTop + 15);
  }

  const finalWidth = Math.max(15, nextRight - nextLeft);
  const finalHeight = Math.max(15, nextBottom - nextTop);

  let fontSize = element.fontSize;
  if (element.type === "text") {
    const prevHeight = bounds.height || (element.fontSize || 24);
    const scale = finalHeight / prevHeight;
    fontSize = Math.max(10, Math.min(160, Math.round((element.fontSize || 24) * scale)));
  }

  return {
    ...element,
    x: nextLeft,
    y: nextTop,
    width: finalWidth,
    height: finalHeight,
    ...(element.type === "text" ? { fontSize } : {}),
    points:
      element.type === "pencil"
        ? scalePencilPoints(element.points, bounds, {
            x: nextLeft,
            y: nextTop,
            width: finalWidth,
            height: finalHeight
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

export function drawShapeText(
  context: CanvasRenderingContext2D,
  text: string,
  bounds: { x: number; y: number; width: number; height: number },
  color: string,
  fontSize: number = 16
) {
  context.save();
  context.font = `600 ${fontSize}px "Inter", "Segoe UI", sans-serif`;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const lines = text.split("\n");
  const lineHeight = fontSize * 1.3;
  const startY = bounds.y + bounds.height / 2 - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    context.fillText(line, bounds.x + bounds.width / 2, startY + index * lineHeight);
  });
  context.restore();
}

/**
 * Captures a set of whiteboard elements (typically pencil strokes) into
 * a base64-encoded PNG data URL by drawing them onto an offscreen canvas.
 */
export function exportSelectionToImage(
  elements: WhiteboardElement[],
  backgroundColor: string = "#ffffff"
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

  const padding = 24;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  if (width <= 0 || height <= 0) return null;

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Translate so our bounding box starts at (padding, padding)
  ctx.translate(-minX + padding, -minY + padding);

  for (const el of elements) {
    drawElement(ctx, el, false, false);
  }

  return offscreen.toDataURL("image/png");
}

/**
 * F1.11: Exports whiteboard elements into a standalone vector SVG string
 */
export function exportToSvg(
  elements: WhiteboardElement[],
  backgroundColor: string = "#010409"
): string {
  if (elements.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${backgroundColor}"/></svg>`;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const b = getNormalizedBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const padding = 40;
  const width = Math.max(maxX - minX + padding * 2, 200);
  const height = Math.max(maxY - minY + padding * 2, 200);
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;

  const svgParts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBoxX} ${viewBoxY} ${width} ${height}">`,
    `  <rect x="${viewBoxX}" y="${viewBoxY}" width="${width}" height="${height}" fill="${backgroundColor}" />`
  ];

  for (const el of elements) {
    const b = getNormalizedBounds(el);
    const stroke = el.strokeColor || "#ffffff";
    const strokeWidth = el.strokeWidth || 2;
    const fill = el.fillColor && el.fillColor !== "transparent" ? el.fillColor : "none";

    if (el.type === "rectangle") {
      svgParts.push(`  <rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="4" />`);
    } else if (el.type === "sticky") {
      const noteBg = el.fillColor && el.fillColor !== "transparent" ? el.fillColor : "#fef08a";
      svgParts.push(`  <g>`);
      svgParts.push(`    <rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${noteBg}" stroke="${stroke}" stroke-width="1" rx="8" />`);
      if (el.text) {
        const lines = el.text.split("\n");
        lines.forEach((line, i) => {
          svgParts.push(`    <text x="${b.x + 16}" y="${b.y + 24 + i * 22}" fill="#1e293b" font-family="sans-serif" font-size="${el.fontSize || 16}">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`);
        });
      }
      svgParts.push(`  </g>`);
    } else if (el.type === "circle" || el.type === "ellipse") {
      svgParts.push(`  <ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`);
    } else if (el.type === "line" || el.type === "arrow") {
      svgParts.push(`  <line x1="${el.x}" y1="${el.y}" x2="${el.x + el.width}" y2="${el.y + el.height}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" />`);
    } else if (el.type === "pencil" && el.points.length > 0) {
      const pathData = el.points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      svgParts.push(`  <path d="${pathData}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`);
    } else if (el.type === "text" && el.text) {
      const lines = el.text.split("\n");
      lines.forEach((line, i) => {
        svgParts.push(`  <text x="${b.x}" y="${b.y + 20 + i * (el.fontSize || 24) * 1.2}" fill="${stroke}" font-family="sans-serif" font-size="${el.fontSize || 24}">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`);
      });
    } else if (el.type === "image" && el.imageUrl) {
      const resolvedUrl = resolveImageUrl(el.imageUrl);
      svgParts.push(`  <image href="${resolvedUrl}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" />`);
    }
  }

  svgParts.push(`</svg>`);
  return svgParts.join("\n");
}

export function getCombinedBounds(elements: WhiteboardElement[]): { x: number; y: number; width: number; height: number } | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const b = getNormalizedBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  if (minX === Infinity) return null;

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function getBoundingBoxResizeHandles(bounds: { x: number; y: number; width: number; height: number }) {
  const half = HANDLE_SIZE / 2;
  return [
    { id: "top-left" as const, x: bounds.x - half, y: bounds.y - half },
    { id: "top-right" as const, x: bounds.x + bounds.width - half, y: bounds.y - half },
    { id: "bottom-left" as const, x: bounds.x - half, y: bounds.y + bounds.height - half },
    { id: "bottom-right" as const, x: bounds.x + bounds.width - half, y: bounds.y + bounds.height - half }
  ];
}

export function getBoundingBoxResizeHandleAtPoint(
  point: Point,
  bounds: { x: number; y: number; width: number; height: number }
): ResizeHandle | null {
  const grabPad = 6;
  const handles = getBoundingBoxResizeHandles(bounds);
  const found = handles.find(
    (candidate) =>
      point.x >= candidate.x - grabPad &&
      point.x <= candidate.x + HANDLE_SIZE + grabPad &&
      point.y >= candidate.y - grabPad &&
      point.y <= candidate.y + HANDLE_SIZE + grabPad
  );
  return found?.id ?? null;
}

export function elementIntersectsBox(
  element: WhiteboardElement,
  box: { x: number; y: number; width: number; height: number }
): boolean {
  const bounds = getNormalizedBounds(element);
  return (
    bounds.x < box.x + box.width &&
    bounds.x + bounds.width > box.x &&
    bounds.y < box.y + box.height &&
    bounds.y + bounds.height > box.y
  );
}

export function resizeElementsGroup(
  initialElements: WhiteboardElement[],
  initialBounds: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  point: Point
): WhiteboardElement[] {
  let nextLeft = initialBounds.x;
  let nextTop = initialBounds.y;
  let nextRight = initialBounds.x + initialBounds.width;
  let nextBottom = initialBounds.y + initialBounds.height;

  if (handle.includes("left")) {
    nextLeft = Math.min(point.x, nextRight - 20);
  }
  if (handle.includes("right")) {
    nextRight = Math.max(point.x, nextLeft + 20);
  }
  if (handle.includes("top")) {
    nextTop = Math.min(point.y, nextBottom - 20);
  }
  if (handle.includes("bottom")) {
    nextBottom = Math.max(point.y, nextTop + 20);
  }

  const newWidth = Math.max(20, nextRight - nextLeft);
  const newHeight = Math.max(20, nextBottom - nextTop);
  const oldWidth = Math.max(1, initialBounds.width);
  const oldHeight = Math.max(1, initialBounds.height);

  const scaleX = newWidth / oldWidth;
  const scaleY = newHeight / oldHeight;

  return initialElements.map((el) => {
    const relX = el.x - initialBounds.x;
    const relY = el.y - initialBounds.y;

    const newX = nextLeft + relX * scaleX;
    const newY = nextTop + relY * scaleY;
    const elWidth = el.width * scaleX;
    const elHeight = el.height * scaleY;

    let fontSize = el.fontSize;
    if (el.type === "text" || el.type === "sticky") {
      fontSize = Math.max(10, Math.min(160, Math.round((el.fontSize || 24) * Math.min(scaleX, scaleY))));
    }

    const points =
      el.type === "pencil"
        ? el.points.map((p) => ({
            x: nextLeft + (p.x - initialBounds.x) * scaleX,
            y: nextTop + (p.y - initialBounds.y) * scaleY
          }))
        : el.points;

    return {
      ...el,
      x: newX,
      y: newY,
      width: elWidth,
      height: elHeight,
      ...(fontSize ? { fontSize } : {}),
      points
    };
  });
}

export function drawMultiSelectionBox(
  context: CanvasRenderingContext2D,
  elements: WhiteboardElement[]
) {
  if (elements.length <= 1) return;
  const bounds = getCombinedBounds(elements);
  if (!bounds) return;

  context.save();
  // Draw subtle individual selection frames
  elements.forEach((el) => {
    const b = getNormalizedBounds(el);
    context.strokeStyle = "rgba(59, 130, 246, 0.45)";
    context.lineWidth = 1;
    context.setLineDash([3, 3]);
    context.strokeRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
  });

  // Draw main collective bounding box
  context.strokeStyle = "#3b82f6";
  context.lineWidth = 1.5;
  context.setLineDash([6, 4]);
  context.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
  context.setLineDash([]);

  // Draw 4 corner handles
  const handles = getBoundingBoxResizeHandles(bounds);
  handles.forEach((handle) => {
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#3b82f6";
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(handle.x, handle.y, HANDLE_SIZE, HANDLE_SIZE, 3);
    context.fill();
    context.stroke();
  });

  context.restore();
}

export function drawMarqueeBox(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number }
) {
  if (box.width < 1 && box.height < 1) return;
  context.save();
  context.fillStyle = "rgba(59, 130, 246, 0.12)";
  context.strokeStyle = "#3b82f6";
  context.lineWidth = 1.5;
  context.setLineDash([5, 3]);
  context.fillRect(box.x, box.y, box.width, box.height);
  context.strokeRect(box.x, box.y, box.width, box.height);
  context.restore();
}



