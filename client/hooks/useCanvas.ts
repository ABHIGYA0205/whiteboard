"use client";

import {
  createElement,
  drawElement,
  drawMarqueeBox,
  drawMultiSelectionBox,
  elementIntersectsBox,
  getBoundingBoxResizeHandleAtPoint,
  getCombinedBounds,
  getResizeHandleAtPoint,
  hitTestElement,
  resizeElement,
  resizeElementsGroup,
  translateElement,
  updateElementDraft,
  getNormalizedBounds
} from "@/components/Canvas/drawingUtils";
import { useBoardStore } from "@/store/boardStore";
import type {
  CursorPosition,
  Point,
  WhiteboardElement
} from "@shared/types";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent
} from "react";

type CollaborationApi = {
  emitDraw: (element: WhiteboardElement) => void;
  emitElementUpdate: (element: WhiteboardElement) => void;
  emitCursor: (cursor: Omit<CursorPosition, "userId">) => void;
  emitReplace?: (elements: WhiteboardElement[]) => void;
  emitLaser?: (point: Point, color?: string) => void;
};

type UseCanvasOptions = {
  canvasRef: RefObject<HTMLCanvasElement>;
  containerRef: RefObject<HTMLDivElement>;
  collaboration: CollaborationApi;
};

type InteractionState =
  | { mode: "idle" }
  | {
      mode: "drawing";
      elementId: string;
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "dragging";
      elementIds: string[];
      origin: Point;
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "resizing";
      elementId: string;
      handle: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "resizing-group";
      elementIds: string[];
      handle: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      initialBounds: { x: number; y: number; width: number; height: number };
      initialElements: WhiteboardElement[];
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "box-selecting";
      origin: Point;
      current: Point;
    }
  | { mode: "erasing"; previousElements: WhiteboardElement[] }
  | { mode: "panning"; origin: Point; viewportOrigin: Point };

const GRID_SIZE = 48;
const ZOOM_IN_FACTOR = 1.035;
const ZOOM_OUT_FACTOR = 0.965;
const PAN_SENSITIVITY = 0.82;

export function useCanvas({
  canvasRef,
  containerRef,
  collaboration
}: UseCanvasOptions) {
  const elements = useBoardStore((state) => state.elements);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const selectedElementIds = useBoardStore((state) => state.selectedElementIds);
  const tool = useBoardStore((state) => state.tool);
  const strokeColor = useBoardStore((state) => state.strokeColor);
  const fillColor = useBoardStore((state) => state.fillColor);
  const strokeWidth = useBoardStore((state) => state.strokeWidth);
  const strokeStyle = useBoardStore((state) => state.strokeStyle);
  const fillStyle = useBoardStore((state) => state.fillStyle);
  const roughness = useBoardStore((state) => state.roughness);
  const roundness = useBoardStore((state) => state.roundness);
  const opacity = useBoardStore((state) => state.opacity);
  const viewport = useBoardStore((state) => state.viewport);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const selectElement = useBoardStore((state) => state.selectElement);
  const setViewport = useBoardStore((state) => state.setViewport);
  const isLocked = useBoardStore((state) => state.isLocked);

  const interactionRef = useRef<InteractionState>({ mode: "idle" });
  const lastClickRef = useRef<{ time: number; x: number; y: number; id: string | null }>({
    time: 0,
    x: 0,
    y: 0,
    id: null
  });
  const devicePixelRatioRef = useRef(1);
  const elementsRef = useRef(elements);
  const viewportRef = useRef(viewport);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      devicePixelRatioRef.current = ratio;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      render();
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);

    return () => observer.disconnect();
  }, [canvasRef, containerRef]);

  const theme = useBoardStore((state) => state.theme);
  const activeTouchesRef = useRef<Map<number, Point>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number | null>(null);

  useEffect(() => {
    render();
  }, [elements, selectedElementId, selectedElementIds, viewport, theme]);

  // Re-render when async images finish loading
  useEffect(() => {
    const onImageLoaded = () => render();
    window.addEventListener("image-loaded", onImageLoaded);
    return () => window.removeEventListener("image-loaded", onImageLoaded);
  }, []);

  const render = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const currentElements = elementsRef.current;
    const currentViewport = viewportRef.current;
    const ratio = devicePixelRatioRef.current;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = theme === "dark" ? "#010409" : "#f8fafc";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.translate(currentViewport.x, currentViewport.y);
    context.scale(currentViewport.zoom, currentViewport.zoom);
    drawGrid(context, canvas.width / ratio, canvas.height / ratio, currentViewport, theme);

    const isSingleSelection = selectedElementIds.length === 1;
    const isMultiSelection = selectedElementIds.length > 1;

    currentElements.forEach((element) =>
      drawElement(
        context,
        element,
        isSingleSelection && element.id === selectedElementId,
        tool === "select" && interactionRef.current.mode !== "drawing",
        theme
      )
    );

    if (isMultiSelection && tool === "select" && interactionRef.current.mode !== "drawing") {
      const selectedEls = currentElements.filter((el) => selectedElementIds.includes(el.id));
      drawMultiSelectionBox(context, selectedEls);
    }

    if (interactionRef.current.mode === "box-selecting") {
      const box = {
        x: Math.min(interactionRef.current.origin.x, interactionRef.current.current.x),
        y: Math.min(interactionRef.current.origin.y, interactionRef.current.current.y),
        width: Math.abs(interactionRef.current.current.x - interactionRef.current.origin.x),
        height: Math.abs(interactionRef.current.current.y - interactionRef.current.origin.y)
      };
      drawMarqueeBox(context, box);
    }

    // F2.5: Render glowing laser pointer trail
    const laserPoints = useBoardStore.getState().laserPoints;
    const now = Date.now();
    for (const lp of laserPoints) {
      const age = now - lp.time;
      if (age > 1200) continue;
      const alpha = 1 - age / 1200;
      context.save();
      context.shadowColor = lp.color;
      context.shadowBlur = 12;
      context.fillStyle = lp.color;
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(lp.x, lp.y, 6 * alpha, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    context.restore();
  };

  useEffect(() => {
    let animId: number;
    const tick = () => {
      if (useBoardStore.getState().laserPoints.length > 0) {
        useBoardStore.getState().clearExpiredLaserPoints();
        render();
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const getCanvasPoint = (event: PointerEvent | ReactPointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const currentViewport = viewportRef.current;

    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (event.clientX - rect.left - currentViewport.x) / currentViewport.zoom,
      y: (event.clientY - rect.top - currentViewport.y) / currentViewport.zoom
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    const currentElements = elementsRef.current;
    const currentViewport = viewportRef.current;
    const activeElement = [...currentElements]
      .reverse()
      .find((element) => hitTestElement(point, element));

    if (event.button === 1 || event.button === 2 || (event.shiftKey && tool === "pan") || tool === "pan") {
      interactionRef.current = {
        mode: "panning",
        origin: { x: event.clientX, y: event.clientY },
        viewportOrigin: { x: currentViewport.x, y: currentViewport.y }
      };
      return;
    }

    if (isLocked) {
      return;
    }

    if (tool === "select") {
      // 1. Check resize handle on multi-selection bounding box
      if (selectedElementIds.length > 1) {
        const selectedEls = currentElements.filter((el) => selectedElementIds.includes(el.id));
        const groupBounds = getCombinedBounds(selectedEls);
        if (groupBounds) {
          const groupHandle = getBoundingBoxResizeHandleAtPoint(point, groupBounds);
          if (groupHandle) {
            interactionRef.current = {
              mode: "resizing-group",
              elementIds: [...selectedElementIds],
              handle: groupHandle,
              initialBounds: groupBounds,
              initialElements: currentElements.map((el) => ({
                ...el,
                points: el.points ? [...el.points] : []
              })),
              previousElements: currentElements
            };
            return;
          }
        }
      }

      // 2. Check resize handle on single selected element
      if (selectedElementIds.length === 1 && activeElement && activeElement.id === selectedElementIds[0]) {
        const handle = getResizeHandleAtPoint(point, activeElement);
        if (handle) {
          interactionRef.current = {
            mode: "resizing",
            elementId: activeElement.id,
            handle,
            previousElements: currentElements
          };
          return;
        }
      }

      // 3. Check active element hit
      if (activeElement) {
        const now = Date.now();
        const isDoubleTap =
          lastClickRef.current.id === activeElement.id &&
          now - lastClickRef.current.time < 380 &&
          Math.hypot(point.x - lastClickRef.current.x, point.y - lastClickRef.current.y) < 20;

        lastClickRef.current = { time: now, x: point.x, y: point.y, id: activeElement.id };

        if (
          isDoubleTap &&
          (activeElement.type === "text" ||
            activeElement.type === "sticky" ||
            activeElement.type === "rectangle" ||
            activeElement.type === "circle")
        ) {
          useBoardStore.getState().setEditingElementId(activeElement.id);
          selectElement(activeElement.id);
          return;
        }

        // Shift + Click: toggle element in/out of selection
        if (event.shiftKey) {
          const isAlreadySelected = selectedElementIds.includes(activeElement.id);
          const nextIds = isAlreadySelected
            ? selectedElementIds.filter((id) => id !== activeElement.id)
            : [...selectedElementIds, activeElement.id];
          selectElement(nextIds);
          interactionRef.current = {
            mode: "dragging",
            elementIds: nextIds,
            origin: point,
            previousElements: currentElements
          };
          return;
        }

        // Alt+drag: Duplicate selection immediately on drag!
        if (event.altKey) {
          const targetIds = selectedElementIds.includes(activeElement.id) ? selectedElementIds : [activeElement.id];
          const idSet = new Set(targetIds);
          const toClone = currentElements.filter((el) => idSet.has(el.id));
          const clones = toClone.map((el) => ({
            ...el,
            id: crypto.randomUUID(),
            points: el.points.map((p) => ({ ...p }))
          }));
          const cloneIds = clones.map((c) => c.id);
          const nextElements = [...currentElements, ...clones];
          setElements(nextElements);
          selectElement(cloneIds);
          interactionRef.current = {
            mode: "dragging",
            elementIds: cloneIds,
            origin: point,
            previousElements: currentElements
          };
          return;
        }

        // Click on element: if already in selection, keep multi-selection for group drag!
        if (selectedElementIds.includes(activeElement.id)) {
          interactionRef.current = {
            mode: "dragging",
            elementIds: selectedElementIds,
            origin: point,
            previousElements: currentElements
          };
          return;
        }

        // Otherwise select only this element
        selectElement(activeElement.id);
        interactionRef.current = {
          mode: "dragging",
          elementIds: [activeElement.id],
          origin: point,
          previousElements: currentElements
        };
        return;
      }

      // 4. Clicked on empty canvas -> Marquee box selection!
      lastClickRef.current = { time: Date.now(), x: point.x, y: point.y, id: null };
      if (!event.shiftKey) {
        selectElement(null);
      }
      interactionRef.current = {
        mode: "box-selecting",
        origin: point,
        current: point
      };
      render();
      return;
    }

    if (tool === "eraser") {
      interactionRef.current = {
        mode: "erasing",
        previousElements: currentElements
      };
      eraseAtPoint(point);
      return;
    }

    const shapeOptions = { strokeStyle, fillStyle, roughness, roundness, opacity };

    if (tool === "text") {
      event.preventDefault(); // Prevent mousedown from firing and stealing focus back from the textarea
      const element = createElement(tool, point, strokeColor, strokeWidth, fillColor, shapeOptions);
      element.text = "";
      element.width = 100; // default initial width
      element.height = element.fontSize || 24;
      
      const newElements = [...currentElements, element];
      setElements(newElements);
      collaboration.emitDraw(element);
      useBoardStore.getState().setEditingElementId(element.id);
      selectElement(null);
      useBoardStore.getState().setTool("select");
      return;
    }

    if (tool === "laser") {
      useBoardStore.getState().addLaserPoint(point, strokeColor);
      collaboration.emitLaser?.(point, strokeColor);
      render();
      return;
    }

    if (tool === "sticky") {
      const element = createElement("sticky", point, strokeColor, 1, fillColor !== "transparent" ? fillColor : "#fef08a", shapeOptions);
      const newElements = [...currentElements, element];
      setElements(newElements);
      commitElements(newElements);
      collaboration.emitDraw(element);
      useBoardStore.getState().setEditingElementId(element.id);
      selectElement(element.id);
      useBoardStore.getState().setTool("select");
      return;
    }

    const element = createElement(tool, point, strokeColor, strokeWidth, fillColor, shapeOptions);
    if (tool === "arrow" || tool === "line") {
      const nearShape = currentElements.slice().reverse().find((el) => {
        if (el.type === "line" || el.type === "arrow" || el.type === "pencil") return false;
        const b = getNormalizedBounds(el);
        return (
          point.x >= b.x - 20 &&
          point.x <= b.x + b.width + 20 &&
          point.y >= b.y - 20 &&
          point.y <= b.y + b.height + 20
        );
      });
      if (nearShape) {
        element.startBinding = { elementId: nearShape.id };
      }
    }
    setElements([...currentElements, element]);
    interactionRef.current = {
      mode: "drawing",
      elementId: element.id,
      previousElements: currentElements
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    const currentElements = elementsRef.current;
    const currentViewport = viewportRef.current;
    const currentUserName =
      typeof window !== "undefined" ? localStorage.getItem("whiteboard_user_name") : null;
    collaboration.emitCursor({
      x: point.x,
      y: point.y,
      color: strokeColor,
      name: currentUserName || undefined
    });

    if (tool === "laser" && event.buttons > 0) {
      useBoardStore.getState().addLaserPoint(point, strokeColor);
      collaboration.emitLaser?.(point, strokeColor);
      render();
      return;
    }

    const interaction = interactionRef.current;

    if (interaction.mode === "idle") {
      return;
    }

    if (interaction.mode === "panning") {
      setViewport({
        ...currentViewport,
        x:
          interaction.viewportOrigin.x +
          (event.clientX - interaction.origin.x) * PAN_SENSITIVITY,
        y:
          interaction.viewportOrigin.y +
          (event.clientY - interaction.origin.y) * PAN_SENSITIVITY
      });
      return;
    }

    if (interaction.mode === "drawing") {
      const nextElements = currentElements.map((element) =>
        element.id === interaction.elementId
          ? updateElementDraft(element, point)
          : element
      );
      setElements(nextElements);
      const element = nextElements.find(
        (candidate) => candidate.id === interaction.elementId
      );
      if (element) {
        collaboration.emitDraw(element);
      }
      return;
    }

    if (interaction.mode === "box-selecting") {
      interactionRef.current = {
        ...interaction,
        current: point
      };
      const box = {
        x: Math.min(interaction.origin.x, point.x),
        y: Math.min(interaction.origin.y, point.y),
        width: Math.abs(point.x - interaction.origin.x),
        height: Math.abs(point.y - interaction.origin.y)
      };

      if (box.width > 4 || box.height > 4) {
        const matched = currentElements
          .filter((el) => elementIntersectsBox(el, box))
          .map((el) => el.id);
        selectElement(matched);
      }
      render();
      return;
    }

    if (interaction.mode === "dragging") {
      const deltaX = point.x - interaction.origin.x;
      const deltaY = point.y - interaction.origin.y;
      const idSet = new Set(interaction.elementIds);
      const nextElements = currentElements.map((element) => {
        if (idSet.has(element.id)) {
          return translateElement(element, deltaX, deltaY);
        }
        // F1.5: Arrow binding: If this arrow is bound to a dragged shape, update its connected endpoint!
        if (element.type === "arrow" || element.type === "line") {
          const startMoved = element.startBinding && idSet.has(element.startBinding.elementId);
          const endMoved = element.endBinding && idSet.has(element.endBinding.elementId);
          if (startMoved && endMoved) {
            return translateElement(element, deltaX, deltaY);
          }
          if (startMoved) {
            return {
              ...element,
              x: element.x + deltaX,
              y: element.y + deltaY,
              width: element.width - deltaX,
              height: element.height - deltaY
            };
          }
          if (endMoved) {
            return {
              ...element,
              width: element.width + deltaX,
              height: element.height + deltaY
            };
          }
        }
        return element;
      });
      setElements(nextElements);
      interactionRef.current = {
        ...interaction,
        origin: point
      };
      const updatedElements = nextElements.filter(
        (candidate) =>
          idSet.has(candidate.id) ||
          (candidate.type === "arrow" &&
            ((candidate.startBinding && idSet.has(candidate.startBinding.elementId)) ||
              (candidate.endBinding && idSet.has(candidate.endBinding.elementId))))
      );
      updatedElements.forEach((el) => collaboration.emitElementUpdate(el));
      return;
    }

    if (interaction.mode === "resizing") {
      const nextElements = currentElements.map((element) =>
        element.id === interaction.elementId
          ? resizeElement(element, interaction.handle, point)
          : element
      );
      setElements(nextElements);
      const element = nextElements.find(
        (candidate) => candidate.id === interaction.elementId
      );
      if (element) {
        collaboration.emitElementUpdate(element);
      }
      return;
    }

    if (interaction.mode === "resizing-group") {
      const idSet = new Set(interaction.elementIds);
      const targetInitialEls = interaction.initialElements.filter((el) =>
        idSet.has(el.id)
      );
      const resizedTargets = resizeElementsGroup(
        targetInitialEls,
        interaction.initialBounds,
        interaction.handle,
        point
      );
      const targetMap = new Map(resizedTargets.map((el) => [el.id, el]));

      const nextElements = currentElements.map((el) =>
        targetMap.get(el.id) || el
      );
      setElements(nextElements);
      resizedTargets.forEach((el) => collaboration.emitElementUpdate(el));
      return;
    }

    if (interaction.mode === "erasing") {
      eraseAtPoint(point);
    }
  };

  const handlePointerUp = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event?.currentTarget && event.pointerId !== undefined) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {}
    }

    if (interactionRef.current.mode === "drawing") {
      const current = useBoardStore.getState().elements;
      const drawnEl = current.find(
        (el) => el.id === (interactionRef.current as any).elementId
      );
      if (drawnEl && (drawnEl.type === "arrow" || drawnEl.type === "line")) {
        const endPoint = { x: drawnEl.x + drawnEl.width, y: drawnEl.y + drawnEl.height };
        const nearShape = current.slice().reverse().find((el) => {
          if (el.id === drawnEl.id || el.type === "line" || el.type === "arrow" || el.type === "pencil") return false;
          const b = getNormalizedBounds(el);
          return (
            endPoint.x >= b.x - 20 &&
            endPoint.x <= b.x + b.width + 20 &&
            endPoint.y >= b.y - 20 &&
            endPoint.y <= b.y + b.height + 20
          );
        });
        if (nearShape) {
          drawnEl.endBinding = { elementId: nearShape.id };
          const updated = current.map((e) =>
            e.id === drawnEl.id ? { ...drawnEl, endBinding: { elementId: nearShape.id } } : e
          );
          useBoardStore.getState().setElements(updated);
        }
      }
      if (drawnEl) {
        collaboration.emitDraw(drawnEl);
      }
      commitElements(
        useBoardStore.getState().elements,
        interactionRef.current.previousElements
      );
      selectElement(null);
    }

    if (
      interactionRef.current.mode === "dragging" ||
      interactionRef.current.mode === "resizing" ||
      interactionRef.current.mode === "resizing-group"
    ) {
      commitElements(
        useBoardStore.getState().elements,
        interactionRef.current.previousElements
      );
      if (collaboration.emitReplace) {
        collaboration.emitReplace(useBoardStore.getState().elements);
      }
    }

    if (interactionRef.current.mode === "box-selecting") {
      render();
    }

    if (interactionRef.current.mode === "erasing") {
      const nextElements = useBoardStore.getState().elements;
      commitElements(
        nextElements,
        interactionRef.current.previousElements
      );
      if (collaboration.emitReplace) {
        collaboration.emitReplace(nextElements);
      }
    }

    interactionRef.current = { mode: "idle" };
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const zoomDelta = event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
    const nextZoom = Math.min(4, Math.max(0.2, viewport.zoom * zoomDelta));
    const rect = canvasRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const worldX = (pointerX - viewport.x) / viewport.zoom;
    const worldY = (pointerY - viewport.y) / viewport.zoom;

    setViewport({
      zoom: nextZoom,
      x: pointerX - worldX * nextZoom,
      y: pointerY - worldY * nextZoom
    });
  };

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel
  };

  function eraseAtPoint(point: Point) {
    const nextElements = useBoardStore.getState().eraseAtPoint(point, hitTestElement);
    if (nextElements) {
      collaboration.emitReplace?.(nextElements);
    }
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: { x: number; y: number; zoom: number },
  theme: "dark" | "light" = "dark"
) {
  const startX = -viewport.x / viewport.zoom;
  const startY = -viewport.y / viewport.zoom;
  const endX = startX + width / viewport.zoom;
  const endY = startY + height / viewport.zoom;

  context.beginPath();
  context.strokeStyle = theme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
  context.lineWidth = 1 / viewport.zoom;

  for (
    let x = Math.floor(startX / GRID_SIZE) * GRID_SIZE;
    x <= endX;
    x += GRID_SIZE
  ) {
    context.moveTo(x, startY);
    context.lineTo(x, endY);
  }

  for (
    let y = Math.floor(startY / GRID_SIZE) * GRID_SIZE;
    y <= endY;
    y += GRID_SIZE
  ) {
    context.moveTo(startX, y);
    context.lineTo(endX, y);
  }

  context.stroke();
}
