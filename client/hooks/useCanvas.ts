"use client";

import {
  createElement,
  drawElement,
  getResizeHandleAtPoint,
  hitTestElement,
  resizeElement,
  translateElement,
  updateElementDraft
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
      elementId: string;
      origin: Point;
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "resizing";
      elementId: string;
      handle: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      previousElements: WhiteboardElement[];
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
  const tool = useBoardStore((state) => state.tool);
  const strokeColor = useBoardStore((state) => state.strokeColor);
  const fillColor = useBoardStore((state) => state.fillColor);
  const strokeWidth = useBoardStore((state) => state.strokeWidth);
  const viewport = useBoardStore((state) => state.viewport);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const selectElement = useBoardStore((state) => state.selectElement);
  const setViewport = useBoardStore((state) => state.setViewport);
  const isLocked = useBoardStore((state) => state.isLocked);

  const interactionRef = useRef<InteractionState>({ mode: "idle" });
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

  useEffect(() => {
    render();
  }, [elements, selectedElementId, viewport]);

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
    context.fillStyle = "#010409";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.translate(currentViewport.x, currentViewport.y);
    context.scale(currentViewport.zoom, currentViewport.zoom);
    drawGrid(context, canvas.width / ratio, canvas.height / ratio, currentViewport);
    currentElements.forEach((element) =>
      drawElement(
        context,
        element,
        element.id === selectedElementId,
        tool === "select" && interactionRef.current.mode !== "drawing"
      )
    );
    context.restore();
  };

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

    if (event.button === 1 || event.button === 2 || event.shiftKey || tool === "pan") {
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
      if (activeElement) {
        const handle = getResizeHandleAtPoint(point, activeElement);
        selectElement(activeElement.id);

        if (handle) {
          interactionRef.current = {
            mode: "resizing",
            elementId: activeElement.id,
            handle,
            previousElements: currentElements
          };
          return;
        }

        interactionRef.current = {
          mode: "dragging",
          elementId: activeElement.id,
          origin: point,
          previousElements: currentElements
        };
        return;
      }

      selectElement(null);
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

    if (tool === "text") {
      event.preventDefault(); // Prevent mousedown from firing and stealing focus back from the textarea
      const element = createElement(tool, point, strokeColor, strokeWidth, fillColor);
      element.text = "";
      element.width = 100; // default initial width
      element.height = element.fontSize || 24;
      
      const newElements = [...currentElements, element];
      setElements(newElements);
      collaboration.emitDraw(element);
      useBoardStore.getState().setEditingElementId(element.id);
      useBoardStore.getState().setTool("select");
      return;
    }

    const element = createElement(tool, point, strokeColor, strokeWidth, fillColor);
    setElements([...currentElements, element]);
    selectElement(element.id);
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
    collaboration.emitCursor({
      x: point.x,
      y: point.y,
      color: "#ef4444"
    });

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

    if (interaction.mode === "dragging") {
      const deltaX = point.x - interaction.origin.x;
      const deltaY = point.y - interaction.origin.y;
      const nextElements = currentElements.map((element) =>
        element.id === interaction.elementId
          ? translateElement(element, deltaX, deltaY)
          : element
      );
      setElements(nextElements);
      interactionRef.current = {
        ...interaction,
        origin: point
      };
      const element = nextElements.find(
        (candidate) => candidate.id === interaction.elementId
      );
      if (element) {
        collaboration.emitElementUpdate(element);
      }
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

    if (interaction.mode === "erasing") {
      eraseAtPoint(point);
    }
  };

  const handlePointerUp = () => {
    if (interactionRef.current.mode === "drawing") {
      commitElements(
        useBoardStore.getState().elements,
        interactionRef.current.previousElements
      );
    }

    if (
      interactionRef.current.mode === "dragging" ||
      interactionRef.current.mode === "resizing"
    ) {
      commitElements(
        useBoardStore.getState().elements,
        interactionRef.current.previousElements
      );
    }

    if (interactionRef.current.mode === "erasing") {
      commitElements(
        useBoardStore.getState().elements,
        interactionRef.current.previousElements
      );
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
    const liveElements = useBoardStore.getState().elements;
    const hoveredElement = [...liveElements]
      .reverse()
      .find((element) => hitTestElement(point, element));

    if (!hoveredElement) {
      return;
    }

    const nextElements = liveElements.filter(
      (element) => element.id !== hoveredElement.id
    );

    if (nextElements.length === liveElements.length) {
      return;
    }

    setElements(nextElements);
    selectElement(null);
    collaboration.emitReplace?.(nextElements);
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: { x: number; y: number; zoom: number }
) {
  const startX = -viewport.x / viewport.zoom;
  const startY = -viewport.y / viewport.zoom;
  const endX = startX + width / viewport.zoom;
  const endY = startY + height / viewport.zoom;

  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
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
