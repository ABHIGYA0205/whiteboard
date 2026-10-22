"use client";

import type {
  CanvasViewport,
  CursorPosition,
  PresenceUser,
  ToolType,
  WhiteboardElement,
  Point
} from "@shared/types";
import { create } from "zustand";

type StoredCursor = CursorPosition & { lastSeen: number };

export type LaserPoint = {
  x: number;
  y: number;
  time: number;
  color: string;
};

type BoardState = {
  elements: WhiteboardElement[];
  history: WhiteboardElement[][];
  future: WhiteboardElement[][];
  clipboard: WhiteboardElement[];
  version: number;
  tool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  fillStyle: "transparent" | "semi" | "solid";
  roughness: number;
  roundness: boolean;
  opacity: number;
  deletedElementIds: Set<string>;
  selectedElementId: string | null;
  selectedElementIds: string[];
  editingElementId: string | null;
  viewport: CanvasViewport;
  remoteCursors: Record<string, StoredCursor>;
  presenceUsers: PresenceUser[];
  currentUserId: string | null;
  followingUserId: string | null;
  laserPoints: LaserPoint[];
  theme: "dark" | "light";
  isLocked: boolean;
  isPropertiesOpen: boolean;
  setIsPropertiesOpen: (isOpen: boolean) => void;
  togglePropertiesOpen: () => void;
  setIsLocked: (isLocked: boolean) => void;
  setCurrentUserId: (id: string | null) => void;
  setTheme: (theme: "dark" | "light") => void;
  setVersion: (version: number) => void;
  setTool: (tool: ToolType) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeStyle: (style: "solid" | "dashed" | "dotted") => void;
  setFillStyle: (style: "transparent" | "semi" | "solid") => void;
  setRoughness: (roughness: number) => void;
  setRoundness: (roundness: boolean) => void;
  setOpacity: (opacity: number) => void;
  setEditingElementId: (id: string | null) => void;
  setElements: (elements: WhiteboardElement[]) => void;
  commitElements: (
    elements: WhiteboardElement[],
    previousElements?: WhiteboardElement[]
  ) => void;
  loadBoard: (elements: WhiteboardElement[], version?: number) => void;
  replaceElements: (elements: WhiteboardElement[]) => void;
  syncElements: (elements: WhiteboardElement[], version?: number) => void;
  selectElement: (id: string | null | string[]) => void;
  deleteSelected: () => WhiteboardElement[] | null;
  copySelected: () => void;
  paste: (offset?: Point) => WhiteboardElement[] | null;
  duplicateSelected: () => WhiteboardElement[] | null;
  bringForward: () => WhiteboardElement[] | null;
  sendBackward: () => WhiteboardElement[] | null;
  bringToFront: () => WhiteboardElement[] | null;
  sendToBack: () => WhiteboardElement[] | null;
  eraseAtPoint: (
    point: { x: number; y: number },
    hitTest: (point: { x: number; y: number }, element: WhiteboardElement) => boolean
  ) => WhiteboardElement[] | null;
  clearBoard: () => void;
  undo: () => WhiteboardElement[] | null;
  redo: () => WhiteboardElement[] | null;
  setViewport: (viewport: CanvasViewport) => void;
  resetViewport: () => void;
  setZoom: (zoom: number) => void;
  upsertRemoteElement: (element: WhiteboardElement) => void;
  upsertRemoteCursor: (cursor: CursorPosition) => void;
  removeRemoteCursor: (userId: string) => void;
  cleanStaleCursors: () => void;
  setPresenceUsers: (users: PresenceUser[]) => void;
  addPresenceUser: (user: PresenceUser) => void;
  removePresenceUser: (userId: string) => void;
  setFollowingUserId: (id: string | null) => void;
  addLaserPoint: (point: Point, color?: string) => void;
  clearExpiredLaserPoints: () => void;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  elements: [],
  history: [],
  future: [],
  clipboard: [],
  version: 0,
  tool: "pencil",
  strokeColor: "#ececf1",
  fillColor: "transparent",
  strokeWidth: 2,
  strokeStyle: "solid",
  fillStyle: "transparent",
  roughness: 0,
  roundness: false,
  opacity: 1,
  deletedElementIds: new Set<string>(),
  selectedElementId: null,
  selectedElementIds: [],
  editingElementId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  remoteCursors: {},
  presenceUsers: [],
  currentUserId: null,
  followingUserId: null,
  laserPoints: [],
  theme: "dark",
  isLocked: false,
  isPropertiesOpen: typeof window !== "undefined" ? window.innerWidth >= 768 : true,
  setIsPropertiesOpen: (isPropertiesOpen) => set({ isPropertiesOpen }),
  togglePropertiesOpen: () => set((state) => ({ isPropertiesOpen: !state.isPropertiesOpen })),
  setIsLocked: (isLocked) => set({ isLocked }),
  setCurrentUserId: (currentUserId) => set({ currentUserId }),
  setVersion: (version) => set({ version }),
  setTheme: (theme) =>
    set((state) => {
      let nextStroke = state.strokeColor;
      if (theme === "light" && (state.strokeColor === "#ececf1" || state.strokeColor === "#ffffff" || state.strokeColor === "#fff")) {
        nextStroke = "#1e293b";
      } else if (theme === "dark" && (state.strokeColor === "#1e293b" || state.strokeColor === "#0f172a" || state.strokeColor === "#000000")) {
        nextStroke = "#ececf1";
      }
      return { theme, strokeColor: nextStroke };
    }),
  setTool: (tool) =>
    set((state) => ({
      tool,
      selectedElementId: tool === "select" ? state.selectedElementId : null,
      selectedElementIds: tool === "select" ? state.selectedElementIds : []
    })),
  setStrokeColor: (strokeColor) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { strokeColor };
      const idSet = new Set(state.selectedElementIds);
      return {
        strokeColor,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, strokeColor } : el))
      };
    }),
  setFillColor: (fillColor) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { fillColor };
      const idSet = new Set(state.selectedElementIds);
      return {
        fillColor,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, fillColor } : el))
      };
    }),
  setStrokeWidth: (strokeWidth) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { strokeWidth };
      const idSet = new Set(state.selectedElementIds);
      return {
        strokeWidth,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, strokeWidth } : el))
      };
    }),
  setStrokeStyle: (strokeStyle) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { strokeStyle };
      const idSet = new Set(state.selectedElementIds);
      return {
        strokeStyle,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, strokeStyle } : el))
      };
    }),
  setFillStyle: (fillStyle) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { fillStyle };
      const idSet = new Set(state.selectedElementIds);
      return {
        fillStyle,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, fillStyle } : el))
      };
    }),
  setRoughness: (roughness) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { roughness };
      const idSet = new Set(state.selectedElementIds);
      return {
        roughness,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, roughness } : el))
      };
    }),
  setRoundness: (roundness) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { roundness };
      const idSet = new Set(state.selectedElementIds);
      return {
        roundness,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, roundness } : el))
      };
    }),
  setOpacity: (opacity) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { opacity };
      const idSet = new Set(state.selectedElementIds);
      return {
        opacity,
        elements: state.elements.map((el) => (idSet.has(el.id) ? { ...el, opacity } : el))
      };
    }),
  setEditingElementId: (editingElementId) => set({ editingElementId }),
  setElements: (elements) => set({ elements }),
  commitElements: (elements, previousElements) =>
    set((state) => ({
      elements,
      history: [...state.history, previousElements ?? state.elements],
      future: []
    })),
  loadBoard: (elements, version = 0) =>
    set({
      elements,
      version,
      history: [],
      future: [],
      selectedElementId: null,
      selectedElementIds: []
    }),
  replaceElements: (elements) =>
    set((state) => ({
      elements,
      history: [...state.history, state.elements],
      future: []
    })),
  syncElements: (incomingElements, version) =>
    set((state) => {
      const activeEditId = state.editingElementId;
      const remoteMap = new Map(incomingElements.map((el) => [el.id, el]));

      const nextElements = incomingElements
        .filter((remoteEl) => !state.deletedElementIds.has(remoteEl.id))
        .map((remoteEl) => {
          if (remoteEl.id === activeEditId) {
            const localActive = state.elements.find((e) => e.id === activeEditId);
            return localActive || remoteEl;
          }
          return remoteEl;
        });

      if (activeEditId && !remoteMap.has(activeEditId) && !state.deletedElementIds.has(activeEditId)) {
        const localActive = state.elements.find((e) => e.id === activeEditId);
        if (localActive) {
          nextElements.push(localActive);
        }
      }

      // Preserve selection: retain selected element IDs that still exist in nextElements
      const nextIdSet = new Set(nextElements.map((el) => el.id));
      const currentSelected = state.selectedElementIds.length > 0
        ? state.selectedElementIds
        : (state.selectedElementId ? [state.selectedElementId] : []);
      const retainedSelectedIds = currentSelected.filter((id) => nextIdSet.has(id));
      const retainedSelectedId = retainedSelectedIds.includes(state.selectedElementId || "")
        ? state.selectedElementId
        : retainedSelectedIds[0] ?? null;

      return {
        elements: nextElements,
        ...(version !== undefined ? { version } : {}),
        selectedElementId: retainedSelectedId,
        selectedElementIds: retainedSelectedIds
      };
    }),
  selectElement: (payload) =>
    set(() => {
      if (!payload) {
        return { selectedElementId: null, selectedElementIds: [] };
      }
      if (Array.isArray(payload)) {
        return {
          selectedElementIds: payload,
          selectedElementId: payload[0] ?? null
        };
      }
      return {
        selectedElementId: payload,
        selectedElementIds: [payload]
      };
    }),
  deleteSelected: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      const targetIds = state.selectedElementIds.length > 0
        ? state.selectedElementIds
        : (state.selectedElementId ? [state.selectedElementId] : []);
      if (targetIds.length === 0) return state;
      const toDelete = new Set(targetIds);
      const updatedDeleted = new Set(state.deletedElementIds);
      targetIds.forEach((id) => updatedDeleted.add(id));

      nextElements = state.elements.filter((element) => !toDelete.has(element.id));
      return {
        elements: nextElements,
        deletedElementIds: updatedDeleted,
        history: [...state.history, state.elements],
        future: [],
        selectedElementId: null,
        selectedElementIds: []
      };
    });
    return nextElements;
  },
  // F1.2: Copy selected elements to clipboard
  copySelected: () => {
    const state = get();
    if (state.selectedElementIds.length === 0) return;
    const idSet = new Set(state.selectedElementIds);
    const selected = state.elements.filter((el) => idSet.has(el.id));
    if (selected.length > 0) {
      set({ clipboard: selected.map((item) => ({ ...item, points: item.points ? [...item.points] : [] })) });
    }
  },
  // F1.2: Paste elements from clipboard
  paste: (offset = { x: 20, y: 20 }) => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.clipboard.length === 0) return state;
      const clones = state.clipboard.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        x: item.x + offset.x,
        y: item.y + offset.y,
        points: item.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }))
      }));

      nextElements = [...state.elements, ...clones];
      const cloneIds = clones.map((c) => c.id);
      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: [],
        selectedElementIds: cloneIds,
        selectedElementId: cloneIds[0] ?? null
      };
    });
    return nextElements;
  },
  // F1.2: Duplicate selected elements
  duplicateSelected: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.selectedElementIds.length === 0) return state;
      const idSet = new Set(state.selectedElementIds);
      const toClone = state.elements.filter((item) => idSet.has(item.id));
      if (toClone.length === 0) return state;

      const offset = 24;
      const clones: WhiteboardElement[] = toClone.map((el) => ({
        ...el,
        id: crypto.randomUUID(),
        x: el.x + offset,
        y: el.y + offset,
        points: el.points.map((p) => ({ x: p.x + offset, y: p.y + offset }))
      }));

      nextElements = [...state.elements, ...clones];
      const cloneIds = clones.map((c) => c.id);
      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: [],
        selectedElementIds: cloneIds,
        selectedElementId: cloneIds[0] ?? null
      };
    });
    return nextElements;
  },
  // F1.6: Z-order Bring Forward
  bringForward: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.selectedElementIds.length === 0) return state;
      const idSet = new Set(state.selectedElementIds);
      nextElements = [...state.elements];
      for (let i = nextElements.length - 2; i >= 0; i--) {
        if (idSet.has(nextElements[i].id) && !idSet.has(nextElements[i + 1].id)) {
          const temp = nextElements[i];
          nextElements[i] = nextElements[i + 1];
          nextElements[i + 1] = temp;
        }
      }
      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: []
      };
    });
    return nextElements;
  },
  // F1.6: Z-order Send Backward
  sendBackward: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.selectedElementIds.length === 0) return state;
      const idSet = new Set(state.selectedElementIds);
      nextElements = [...state.elements];
      for (let i = 1; i < nextElements.length; i++) {
        if (idSet.has(nextElements[i].id) && !idSet.has(nextElements[i - 1].id)) {
          const temp = nextElements[i];
          nextElements[i] = nextElements[i - 1];
          nextElements[i - 1] = temp;
        }
      }
      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: []
      };
    });
    return nextElements;
  },
  // F1.6: Z-order Bring to Front
  bringToFront: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.selectedElementIds.length === 0) return state;
      const idSet = new Set(state.selectedElementIds);
      const moving = state.elements.filter((item) => idSet.has(item.id));
      const rest = state.elements.filter((item) => !idSet.has(item.id));
      nextElements = [...rest, ...moving];
      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: []
      };
    });
    return nextElements;
  },
  // F1.6: Z-order Send to Back
  sendToBack: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.selectedElementIds.length === 0) return state;
      const idSet = new Set(state.selectedElementIds);
      const moving = state.elements.filter((item) => idSet.has(item.id));
      const rest = state.elements.filter((item) => !idSet.has(item.id));
      nextElements = [...moving, ...rest];
      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: []
      };
    });
    return nextElements;
  },
  eraseAtPoint: (point, hitTest) => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      const hoveredElement = [...state.elements]
        .reverse()
        .find((element) => hitTest(point, element));

      if (!hoveredElement) return state;

      const updatedDeleted = new Set(state.deletedElementIds);
      updatedDeleted.add(hoveredElement.id);

      nextElements = state.elements.filter((element) => element.id !== hoveredElement.id);
      return {
        elements: nextElements,
        deletedElementIds: updatedDeleted,
        history: [...state.history, state.elements],
        future: [],
        selectedElementId: null
      };
    });
    return nextElements;
  },
  clearBoard: () =>
    set((state) => ({
      elements: [],
      history: [...state.history, state.elements],
      future: [],
      selectedElementId: null
    })),
  undo: () => {
    let updated: WhiteboardElement[] | null = null;
    set((state) => {
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      updated = previous;
      return {
        elements: previous,
        history: state.history.slice(0, -1),
        future: [state.elements, ...state.future]
      };
    });
    return updated;
  },
  redo: () => {
    let updated: WhiteboardElement[] | null = null;
    set((state) => {
      const [next, ...remaining] = state.future;
      if (!next) return state;
      updated = next;
      return {
        elements: next,
        history: [...state.history, state.elements],
        future: remaining
      };
    });
    return updated;
  },
  setViewport: (viewport) => set({ viewport }),
  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),
  setZoom: (zoom) => set((state) => ({ viewport: { ...state.viewport, zoom } })),
  upsertRemoteElement: (element) =>
    set((state) => {
      // If local user is actively typing in this element, preserve local text
      if (state.editingElementId === element.id) {
        return state;
      }
      const index = state.elements.findIndex((candidate) => candidate.id === element.id);
      if (index === -1) {
        return { elements: [...state.elements, element] };
      }
      const nextElements = [...state.elements];
      nextElements[index] = element;
      return { elements: nextElements };
    }),
  upsertRemoteCursor: (cursor) =>
    set((state) => {
      const updatedCursors = {
        ...state.remoteCursors,
        [cursor.userId]: { ...cursor, lastSeen: Date.now() }
      };

      let nextViewport = state.viewport;
      if (state.followingUserId === cursor.userId) {
        nextViewport = {
          ...state.viewport,
          x: -cursor.x * state.viewport.zoom + window.innerWidth / 2,
          y: -cursor.y * state.viewport.zoom + window.innerHeight / 2
        };
      }

      return {
        remoteCursors: updatedCursors,
        viewport: nextViewport
      };
    }),
  removeRemoteCursor: (userId) =>
    set((state) => {
      const nextCursors = { ...state.remoteCursors };
      delete nextCursors[userId];
      return { remoteCursors: nextCursors };
    }),
  cleanStaleCursors: () =>
    set((state) => {
      const now = Date.now();
      const nextCursors: Record<string, StoredCursor> = {};
      let changed = false;
      for (const [id, cursor] of Object.entries(state.remoteCursors)) {
        if (now - cursor.lastSeen <= 15000) {
          nextCursors[id] = cursor;
        } else {
          changed = true;
        }
      }
      return changed ? { remoteCursors: nextCursors } : state;
    }),
  setPresenceUsers: (presenceUsers) => set({ presenceUsers }),
  addPresenceUser: (user) =>
    set((state) => ({
      presenceUsers: [
        ...state.presenceUsers.filter((u) => u.userId !== user.userId),
        user
      ]
    })),
  removePresenceUser: (userId) =>
    set((state) => ({
      presenceUsers: state.presenceUsers.filter((u) => u.userId !== userId),
      followingUserId: state.followingUserId === userId ? null : state.followingUserId
    })),
  setFollowingUserId: (followingUserId) => set({ followingUserId }),
  // F2.5: Laser pointer points
  addLaserPoint: (point, color = "#ff0055") =>
    set((state) => ({
      laserPoints: [...state.laserPoints, { ...point, time: Date.now(), color }]
    })),
  clearExpiredLaserPoints: () =>
    set((state) => {
      const cutoff = Date.now() - 1200; // 1.2s laser trail
      const valid = state.laserPoints.filter((p) => p.time > cutoff);
      return valid.length !== state.laserPoints.length ? { laserPoints: valid } : state;
    })
}));
