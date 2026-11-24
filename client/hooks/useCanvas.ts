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
import { withoutLayer } from "@shared/layers";
import type {
  CursorPosition,
  Point,
  WhiteboardElement
} from "@shared/types";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";

type CollaborationApi = {
  emitDraw: (element: WhiteboardElement) => void;
  emitDrawProgress?: (progress: {
    elementId: string;
    points: { x: number; y: number }[];
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  emitElementUpdate: (element: WhiteboardElement) => void;
  emitCursor: (cursor: Omit<CursorPosition, "userId">) => void;
  flushPointerUpdates?: () => void;
  emitReplace?: (elements: WhiteboardElement[]) => void;
  emitLaser?: (point: Point, color?: string) => void;
  requestResync?: () => void;
};

type UseCanvasOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  collaboration: CollaborationApi;
};

type InteractionState =
  | { mode: "idle" }
  | {
      mode: "drawing";
      elementId: string;
      previousElements: WhiteboardElement[];
      isPencil: boolean;
    }
  | {
      mode: "dragging";
      elementIds: string[];
      origin: Point;
      hasMoved?: boolean;
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "resizing";
      elementId: string;
      handle: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      hasMoved?: boolean;
      previousElements: WhiteboardElement[];
    }
  | {
      mode: "resizing-group";
      elementIds: string[];
      handle: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      hasMoved?: boolean;
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
  | { mode: "panning"; origin: Point; viewportOrigin: Point }
  | {
      mode: "pinch-pan";
      initialDistance: number;
      initialZoom: number;
      initialCenter: Point;
      viewportOrigin: Point;
    };

type PointerSample = Pick<PointerEvent, "clientX" | "clientY">;
type PointerMove = PointerSample & Pick<PointerEvent, "buttons">;

const GRID_SIZE = 48;
const ZOOM_IN_FACTOR = 1.035;
const ZOOM_OUT_FACTOR = 0.965;
const PAN_SENSITIVITY = 0.82;

export function useCanvas({
  canvasRef,
  containerRef,
  collaboration
}: UseCanvasOptions) {
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
  const frameRef = useRef<number | null>(null);
  const paintPending = useRef(false);
  const pendingMove = useRef<PointerMove | null>(null);
  const pendingStroke = useRef<PointerSample[]>([]);

  function flushPointerMove() {
    const move = pendingMove.current;
    if (!move) return;
    const stroke = pendingStroke.current;
    pendingMove.current = null;
    pendingStroke.current = [];
    applyPointerMove(move, stroke);
    collaboration.flushPointerUpdates?.();
  }

  function scheduleRender() {
    paintPending.current = true;
    scheduleFrame();
  }

  function scheduleFrame() {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      flushPointerMove();
      if (paintPending.current) {
        paintPending.current = false;
        render();
      }
      frameRef.current = null;
      if (useBoardStore.getState().laserPoints.length) {
        useBoardStore.getState().clearExpiredLaserPoints();
        if (useBoardStore.getState().laserPoints.length) scheduleRender();
      }
    });
  }

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
      scheduleRender();
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      observer.disconnect();
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef, containerRef]);

  const activePointersRef = useRef<Map<number, Point>>(new Map());

  useEffect(() => {
    const unsubscribe = useBoardStore.subscribe((state, previous) => {
      if (state.elements !== previous.elements || state.viewport !== previous.viewport ||
          state.selectedElementIds !== previous.selectedElementIds || state.tool !== previous.tool ||
          state.theme !== previous.theme || state.laserPoints !== previous.laserPoints) {
        scheduleRender();
      }
    });
    window.addEventListener("image-loaded", scheduleRender);
    return () => {
      unsubscribe();
      window.removeEventListener("image-loaded", scheduleRender);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  const render = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const { elements: currentElements, viewport: currentViewport, tool, theme, selectedElementId, selectedElementIds } =
      useBoardStore.getState();
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

  const getCanvasPoint = (
    event: PointerSample,
    rect = canvasRef.current?.getBoundingClientRect(),
    currentViewport = useBoardStore.getState().viewport
  ) => {

    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (event.clientX - rect.left - currentViewport.x) / currentViewport.zoom,
      y: (event.clientY - rect.top - currentViewport.y) / currentViewport.zoom
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    flushPointerMove();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Multi-touch detection (2 or more touches -> pinch zoom and two-finger pan)
    if (activePointersRef.current.size >= 2) {
      // If we were drawing a draft stroke with the first touch, cancel and discard it!
      if (interactionRef.current.mode === "drawing") {
        const state = useBoardStore.getState();
        const remaining = state.removeElements([interactionRef.current.elementId]);
        if (remaining) collaboration.emitReplace?.(remaining);
      }

      useBoardStore.getState().setActiveElementIds([]);
      const pts = Array.from(activePointersRef.current.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const currentViewport = useBoardStore.getState().viewport;

      interactionRef.current = {
        mode: "pinch-pan",
        initialDistance: Math.max(dist, 1),
        initialZoom: currentViewport.zoom,
        initialCenter: center,
        viewportOrigin: { x: currentViewport.x, y: currentViewport.y }
      };
      return;
    }

    const point = getCanvasPoint(event);
    const currentElements = useBoardStore.getState().elements;
    const currentViewport = useBoardStore.getState().viewport;
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
            useBoardStore.getState().setActiveElementIds(selectedElementIds);
            interactionRef.current = {
              mode: "resizing-group",
              elementIds: [...selectedElementIds],
              handle: groupHandle,
              initialBounds: groupBounds,
              initialElements: selectedEls,
              hasMoved: false,
              previousElements: currentElements
            };
            return;
          }
        }
      }

      // 2. Check resize handle on single selected element
      if (selectedElementIds.length === 1) {
        const currentlySelected = currentElements.find((el) => el.id === selectedElementIds[0]);
        if (currentlySelected) {
          const handle = getResizeHandleAtPoint(point, currentlySelected);
          if (handle) {
            useBoardStore.getState().setActiveElementIds([currentlySelected.id]);
            interactionRef.current = {
              mode: "resizing",
              elementId: currentlySelected.id,
              handle,
              hasMoved: false,
              previousElements: currentElements
            };
            return;
          }
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
          useBoardStore.getState().setActiveElementIds(nextIds);
          interactionRef.current = {
            mode: "dragging",
            elementIds: nextIds,
            origin: point,
            hasMoved: false,
            previousElements: currentElements
          };
          return;
        }

        // Alt+drag: Duplicate selection immediately on drag!
        if (event.altKey) {
          const targetIds = selectedElementIds.includes(activeElement.id) ? selectedElementIds : [activeElement.id];
          const idSet = new Set(targetIds);
          const toClone = currentElements.filter((el) => idSet.has(el.id));
          // A copy is a new element: it gets no layer number, so it is on top for everyone.
          const clones = toClone.map((el) => ({
            ...withoutLayer(el),
            id: crypto.randomUUID(),
            points: el.points.map((p) => ({ ...p }))
          }));
          const cloneIds = clones.map((c) => c.id);
          const nextElements = [...currentElements, ...clones];
          setElements(nextElements);
          selectElement(cloneIds);
          useBoardStore.getState().setActiveElementIds(cloneIds);
          interactionRef.current = {
            mode: "dragging",
            elementIds: cloneIds,
            origin: point,
            hasMoved: false,
            previousElements: currentElements
          };
          return;
        }

        // Click on element: if already in selection, keep multi-selection for group drag!
        if (selectedElementIds.includes(activeElement.id)) {
          useBoardStore.getState().setActiveElementIds(selectedElementIds);
          interactionRef.current = {
            mode: "dragging",
            elementIds: selectedElementIds,
            origin: point,
            hasMoved: false,
            previousElements: currentElements
          };
          return;
        }

        // Otherwise select only this element
        useBoardStore.getState().setActiveElementIds([activeElement.id]);
        selectElement(activeElement.id);
        interactionRef.current = {
          mode: "dragging",
          elementIds: [activeElement.id],
          origin: point,
          hasMoved: false,
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
      scheduleRender();
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
      scheduleRender();
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
    useBoardStore.getState().setActiveElementIds([element.id]);
    setElements([...currentElements, element]);
    interactionRef.current = {
      mode: "drawing",
      elementId: element.id,
      previousElements: currentElements,
      isPencil: element.type === "pencil"
    };
    collaboration.emitDraw(element);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    const move = { clientX: event.clientX, clientY: event.clientY, buttons: event.buttons };
    const interaction = interactionRef.current;
    if (interaction.mode === "erasing") {
      applyPointerMove(move, []);
      return;
    }

    pendingMove.current = move;
    if (interaction.mode === "drawing" && interaction.isPencil) {
      const coalesced = event.nativeEvent.getCoalescedEvents?.();
      for (const { clientX, clientY } of coalesced?.length ? coalesced : [move]) {
        pendingStroke.current.push({ clientX, clientY });
      }
    }
    scheduleFrame();
  };

  function applyPointerMove(event: PointerMove, stroke: PointerSample[]) {
    if (interactionRef.current.mode === "pinch-pan") {
      if (activePointersRef.current.size >= 2) {
        const pts = Array.from(activePointersRef.current.values());
        const p1 = pts[0];
        const p2 = pts[1];
        const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const currentCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const pinch = interactionRef.current;

        const scale = currentDist / pinch.initialDistance;
        const newZoom = Math.min(Math.max(pinch.initialZoom * scale, 0.1), 5);

        const worldX = (pinch.initialCenter.x - pinch.viewportOrigin.x) / pinch.initialZoom;
        const worldY = (pinch.initialCenter.y - pinch.viewportOrigin.y) / pinch.initialZoom;

        const newViewportX = currentCenter.x - worldX * newZoom;
        const newViewportY = currentCenter.y - worldY * newZoom;

        setViewport({
          x: newViewportX,
          y: newViewportY,
          zoom: newZoom
        });
      }
      return;
    }

    const { elements: currentElements, viewport: currentViewport, tool, strokeColor } = useBoardStore.getState();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = getCanvasPoint(event, bounds, currentViewport);
    collaboration.emitCursor(point);

    if (tool === "laser" && event.buttons > 0) {
      useBoardStore.getState().addLaserPoint(point, strokeColor);
      collaboration.emitLaser?.(point, strokeColor);
      scheduleRender();
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
      const index = currentElements.findIndex((element) => element.id === interaction.elementId);
      if (index < 0) return;

      const points = stroke.map((sample) => getCanvasPoint(sample, bounds, currentViewport));
      const element = updateElementDraft(currentElements[index], point, points);
      const nextElements = currentElements.slice();
      nextElements[index] = element;
      setElements(nextElements);

      if (element.type === "pencil" && collaboration.emitDrawProgress) {
        collaboration.emitDrawProgress({
          elementId: element.id,
          points,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height
        });
      } else {
        collaboration.emitElementUpdate(element);
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
      scheduleRender();
      return;
    }

    if (interaction.mode === "dragging") {
      const deltaX = point.x - interaction.origin.x;
      const deltaY = point.y - interaction.origin.y;
      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        interaction.hasMoved = true;
      }
      if (!interaction.hasMoved) {
        return;
      }
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
      const updatedElements = nextElements.filter((element, index) => element !== currentElements[index]);
      updatedElements.forEach((el) => collaboration.emitElementUpdate(el));
      return;
    }

    if (interaction.mode === "resizing") {
      interaction.hasMoved = true;
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
      interaction.hasMoved = true;
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
  }

  const handlePointerUp = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    flushPointerMove();
    if (event?.pointerId !== undefined) {
      activePointersRef.current.delete(event.pointerId);
    }

    if (event?.currentTarget && event.pointerId !== undefined) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {}
    }

    if (interactionRef.current.mode === "pinch-pan") {
      if (activePointersRef.current.size < 2) {
        interactionRef.current = { mode: "idle" };
      }
      return;
    }

    const interaction = interactionRef.current;
    useBoardStore.getState().setActiveElementIds([]);
    if (interaction.mode === "drawing") {
      const current = useBoardStore.getState().elements;
      let drawnEl = current.find((element) => element.id === interaction.elementId);
      if (drawnEl && (drawnEl.type === "arrow" || drawnEl.type === "line")) {
        const endPoint = { x: drawnEl.x + drawnEl.width, y: drawnEl.y + drawnEl.height };
        const nearShape = current.slice().reverse().find((el) => {
          if (el.id === interaction.elementId || el.type === "line" || el.type === "arrow" || el.type === "pencil") return false;
          const b = getNormalizedBounds(el);
          return (
            endPoint.x >= b.x - 20 &&
            endPoint.x <= b.x + b.width + 20 &&
            endPoint.y >= b.y - 20 &&
            endPoint.y <= b.y + b.height + 20
          );
        });
        if (nearShape) {
          const bound = { ...drawnEl, endBinding: { elementId: nearShape.id } };
          drawnEl = bound;
          const updated = current.map((element) => element.id === bound.id ? bound : element);
          useBoardStore.getState().setElements(updated);
        }
      }
      if (drawnEl) {
        collaboration.emitDraw(drawnEl);
      }
      commitElements(
        useBoardStore.getState().elements,
        interaction.previousElements
      );
      selectElement(null);
    }

    if (
      (interaction.mode === "dragging" ||
        interaction.mode === "resizing" ||
        interaction.mode === "resizing-group") &&
      interaction.hasMoved
    ) {
      commitElements(
        useBoardStore.getState().elements,
        interaction.previousElements
      );
      collaboration.emitReplace?.(useBoardStore.getState().elements);
    }

    if (interaction.mode === "box-selecting") {
      scheduleRender();
    }

    if (interaction.mode === "erasing") {
      const nextElements = useBoardStore.getState().elements;
      commitElements(
        nextElements,
        interaction.previousElements
      );
      collaboration.emitReplace?.(nextElements);
    }

    interactionRef.current = { mode: "idle" };
  };

  function handleWheel(event: WheelEvent) {
    event.preventDefault();

    const { viewport } = useBoardStore.getState();
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
  }

  return { handlePointerDown, handlePointerMove, handlePointerUp };

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
