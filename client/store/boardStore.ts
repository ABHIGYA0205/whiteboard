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
import { mergeElementLists } from "@shared/collab";
import { sortByLayer, withLayerNumbers, withoutLayer } from "@shared/layers";
import {
  applyEntry,
  pushEntry,
  rememberObjects,
  resetLocalHistory,
  restoreUnderNewIds,
  takeEntry,
  trackLocal,
  type HistoryEntry
} from "./localHistory";

type StoredCursor = CursorPosition & { lastSeen: number };

export type LocalChanges = ReadonlyMap<string, WhiteboardElement | null>;

export type LaserPoint = {
  x: number;
  y: number;
  time: number;
  color: string;
};

type BoardState = {
  elements: WhiteboardElement[];
  history: HistoryEntry[];
  future: HistoryEntry[];
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
  localEditTimes: Map<string, number>;
  pendingLocalChanges: LocalChanges;
  committedVersions: ReadonlyMap<string, number>;
  deferredCommits: ReadonlyMap<string, WhiteboardElement>;
  acknowledgeLocalChanges: (sent: LocalChanges) => void;
  /** Elements the local user is actively drawing/dragging right now. */
  activeElementIds: Set<string>;
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
  loadBoard: (elements: WhiteboardElement[], version?: number, deletedIds?: string[]) => void;
  replaceElements: (elements: WhiteboardElement[]) => void;
  syncElements: (elements: WhiteboardElement[], version?: number) => void;
  /** Union-merge a remote snapshot. Never deletes local work unless tombstoned. */
  mergeRemoteElements: (elements: WhiteboardElement[], deletedIds?: string[], version?: number, source?: "snapshot" | "committed") => void;
  /** Marks the element(s) currently under the local pointer. */
  setActiveElementIds: (ids: string[]) => void;
  /** Apply a remote "clear board" without letting old elements merge back in. */
  applyRemoteClear: () => void;
  selectElement: (id: string | null | string[]) => void;
  deleteSelected: () => WhiteboardElement[] | null;
  /** Deletes the given elements for everyone (they are tombstoned), as one undo step. */
  removeElements: (ids: string[]) => WhiteboardElement[] | null;
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
  /** Puts elements back on the board under new ids (their old ids are deleted for everyone). */
  restoreElements: (elements: WhiteboardElement[]) => WhiteboardElement[] | null;
  undo: () => WhiteboardElement[] | null;
  redo: () => WhiteboardElement[] | null;
  setViewport: (viewport: CanvasViewport) => void;
  resetViewport: () => void;
  setZoom: (zoom: number) => void;
  upsertRemoteElement: (element: WhiteboardElement) => void;
  /** Appends streamed stroke points from a peer (incremental draw updates). */
  appendRemotePoints: (
    elementId: string,
    points: Point[],
    bounds: { x: number; y: number; width: number; height: number }
  ) => void;
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

const LOCAL_EDIT_GRACE_MS = 600;

const warnedUnknownElementIds = new Set<string>();
let resyncHandler: (() => void) | null = null;

export function registerResyncHandler(handler: (() => void) | null) {
  resyncHandler = handler;
}

export function resetUnknownElementWarnings() {
  warnedUnknownElementIds.clear();
}

/** Track locally produced values by id. Socket previews and snapshots bypass this path. */
function markLocalChanges(
  state: BoardState,
  next: WhiteboardElement[],
  tombstones: Set<string> = state.deletedElementIds
): Pick<BoardState, "localEditTimes" | "pendingLocalChanges"> {
  const previous = state.elements;
  if (previous === next && tombstones === state.deletedElementIds) {
    return { localEditTimes: state.localEditTimes, pendingLocalChanges: state.pendingLocalChanges };
  }

  const localEditTimes = new Map(state.localEditTimes);
  const pendingLocalChanges = new Map(state.pendingLocalChanges);
  let beforeById: Map<string, WhiteboardElement> | undefined;
  const now = Date.now();
  for (let i = 0; i < next.length; i++) {
    const element = next[i];
    let before = previous[i];
    if (beforeById || (before && before.id !== element.id)) {
      beforeById ??= new Map(previous.map((previousElement) => [previousElement.id, previousElement]));
      before = beforeById.get(element.id)!;
    }
    if (before !== element) {
      pendingLocalChanges.set(element.id, element);
      localEditTimes.set(element.id, now);
    }
  }
  if (tombstones !== state.deletedElementIds) {
    for (const id of tombstones) {
      if (!state.deletedElementIds.has(id)) {
        pendingLocalChanges.set(id, null);
        localEditTimes.delete(id);
      }
    }
  }
  if (localEditTimes.size > 2000) {
    for (const [id, at] of localEditTimes) {
      if (now - at > LOCAL_EDIT_GRACE_MS * 10) localEditTimes.delete(id);
    }
  }
  return { localEditTimes, pendingLocalChanges };
}

/** State update for a local action that ends an undo step. */
function commitLocal(
  state: BoardState,
  next: WhiteboardElement[],
  tombstones: Set<string> = state.deletedElementIds,
  kind?: string
): Pick<BoardState, "elements" | "localEditTimes" | "pendingLocalChanges" | "history" | "future"> {
  trackLocal(state.elements, next);
  const entry = takeEntry(next, tombstones, kind);
  return {
    elements: next,
    ...markLocalChanges(state, next, tombstones),
    history: entry ? pushEntry(state.history, entry) : state.history,
    future: entry ? [] : state.future
  };
}

/** A style change on the selection: applied at once and kept as its own undo step. */
function styleLocal(state: BoardState, patch: Partial<WhiteboardElement>): Partial<BoardState> {
  const idSet = new Set(state.selectedElementIds);
  const next = state.elements.map((element) => (idSet.has(element.id) ? { ...element, ...patch } : element));
  return commitLocal(state, next, state.deletedElementIds, "style");
}

/**
 * A layer change: `reordered` is the board in its new array order. The order is written into the
 * elements as layer numbers, because only element data reaches the other users and the storage.
 * Returns null when the order did not change.
 */
function layerLocal(
  state: BoardState,
  reordered: WhiteboardElement[]
): { patch: Pick<BoardState, "elements" | "localEditTimes" | "pendingLocalChanges" | "history" | "future">; elements: WhiteboardElement[] } | null {
  if (reordered.every((element, index) => element === state.elements[index])) return null;
  // First every element gets a number for the place it has NOW. Those numbers depend only on the
  // board, so two users who change layers at the same moment write the same numbers on everything
  // that neither of them moved. Then only the moved elements are renumbered.
  const inPlace = new Map<string, WhiteboardElement>();
  for (const element of withLayerNumbers(state.elements)) inPlace.set(element.id, element);
  const elements = withLayerNumbers(
    reordered.map((element) => inPlace.get(element.id) as WhiteboardElement),
    new Set(state.selectedElementIds)
  );
  return { patch: commitLocal(state, elements, state.deletedElementIds, "layer"), elements };
}

function keepSelection(state: BoardState, elements: WhiteboardElement[]): Pick<BoardState, "selectedElementId" | "selectedElementIds"> {
  const alive = new Set(elements.map((element) => element.id));
  const selectedElementIds = state.selectedElementIds.filter((id) => alive.has(id));
  const selectedElementId =
    state.selectedElementId && alive.has(state.selectedElementId) ? state.selectedElementId : selectedElementIds[0] ?? null;
  return { selectedElementId, selectedElementIds };
}

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
  localEditTimes: new Map<string, number>(),
  pendingLocalChanges: new Map(),
  committedVersions: new Map(),
  deferredCommits: new Map(),
  acknowledgeLocalChanges: (sent) => {
    const confirmed: WhiteboardElement[] = [];
    set((state) => {
      const pendingLocalChanges = new Map(state.pendingLocalChanges);
      const deferredCommits = new Map(state.deferredCommits);
      for (const [id, value] of sent) {
        if (pendingLocalChanges.get(id) !== value) continue;
        pendingLocalChanges.delete(id);
        const element = deferredCommits.get(id);
        if (element) confirmed.push(element);
        deferredCommits.delete(id);
      }
      return { pendingLocalChanges, deferredCommits };
    });
    if (confirmed.length) get().mergeRemoteElements(confirmed, undefined, undefined, "snapshot");
  },
  activeElementIds: new Set<string>(),
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
  isPropertiesOpen: typeof window !== "undefined" ? window.innerWidth > 1024 : true,
  setIsPropertiesOpen: (isPropertiesOpen) => set({ isPropertiesOpen }),
  togglePropertiesOpen: () => set((state) => ({ isPropertiesOpen: !state.isPropertiesOpen })),
  setIsLocked: (isLocked) => set({ isLocked }),
  setCurrentUserId: (currentUserId) => set({ currentUserId }),
  setVersion: (version) => set((state) => version > state.version ? { version } : state),
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
      return { strokeColor, ...styleLocal(state, { strokeColor }) };
    }),
  setFillColor: (fillColor) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { fillColor };
      return { fillColor, ...styleLocal(state, { fillColor }) };
    }),
  setStrokeWidth: (strokeWidth) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { strokeWidth };
      return { strokeWidth, ...styleLocal(state, { strokeWidth }) };
    }),
  setStrokeStyle: (strokeStyle) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { strokeStyle };
      return { strokeStyle, ...styleLocal(state, { strokeStyle }) };
    }),
  setFillStyle: (fillStyle) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { fillStyle };
      return { fillStyle, ...styleLocal(state, { fillStyle }) };
    }),
  setRoughness: (roughness) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { roughness };
      return { roughness, ...styleLocal(state, { roughness }) };
    }),
  setRoundness: (roundness) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { roundness };
      return { roundness, ...styleLocal(state, { roundness }) };
    }),
  setOpacity: (opacity) =>
    set((state) => {
      if (state.selectedElementIds.length === 0 || state.tool !== "select") return { opacity };
      return { opacity, ...styleLocal(state, { opacity }) };
    }),
  setEditingElementId: (editingElementId) => set({ editingElementId }),
  setElements: (elements) =>
    set((state) => {
      trackLocal(state.elements, elements);
      return {
        elements,
        ...markLocalChanges(state, elements)
      };
    }),
  // The second argument (previousElements) is accepted for the existing call sites and ignored: what
  // the action changed is tracked element by element since its first setElements call.
  commitElements: (elements) => set((state) => commitLocal(state, elements)),
  loadBoard: (elements, version = 0, deletedIds = []) => {
    resetLocalHistory();
    set({
      elements: sortByLayer(elements),
      version,
      history: [],
      future: [],
      deletedElementIds: new Set(deletedIds),
      localEditTimes: new Map<string, number>(),
      pendingLocalChanges: new Map(),
      committedVersions: new Map(),
      deferredCommits: new Map(),
      activeElementIds: new Set<string>(),
      editingElementId: null,
      remoteCursors: {},
      presenceUsers: [],
      followingUserId: null,
      selectedElementId: null,
      selectedElementIds: []
    });
  },
  replaceElements: (elements) => set((state) => commitLocal(state, elements)),
  syncElements: (incomingElements, version) =>
    // Backwards-compatible alias: this used to REPLACE the whole board, which
    // silently deleted anything the sender did not know about (a peer's newer
    // stroke, or the stroke you were drawing at that moment). It now merges.
    get().mergeRemoteElements(incomingElements, undefined, version),
  mergeRemoteElements: (incomingElements, deletedIds, version, source) =>
    set((state) => {
      let committedVersions = state.committedVersions;
      let deferredCommits = state.deferredCommits;
      let incoming = incomingElements;
      if (source === "committed" && version !== undefined && incoming.length > 0) {
        const versions = new Map(committedVersions);
        const deferred = new Map(deferredCommits);
        incoming = incoming.filter((element) => {
          if (state.deletedElementIds.has(element.id) || (versions.get(element.id) ?? 0) > version) return false;
          versions.set(element.id, version);
          if (state.pendingLocalChanges.has(element.id)) {
            deferred.set(element.id, element);
            return false;
          }
          return true;
        });
        committedVersions = versions;
        deferredCommits = deferred;
      }
      const { elements, changed, tombstones } = mergeElementLists({
        local: state.elements,
        incoming,
        deletedIds,
        localTombstones: state.deletedElementIds,
        localEditTimes: state.localEditTimes,
        editingElementId: state.editingElementId,
        activeElementIds: source
          ? [...state.activeElementIds, ...state.pendingLocalChanges.keys()]
          : state.activeElementIds,
        graceMs: source ? 0 : LOCAL_EDIT_GRACE_MS
      });

      const nextVersion = Math.max(state.version, version ?? 0);
      let pendingLocalChanges = state.pendingLocalChanges;
      if (deletedIds?.length) {
        const pending = new Map(pendingLocalChanges);
        const deferred = new Map(deferredCommits);
        const versions = new Map(committedVersions);
        for (const id of deletedIds) {
          if (pending.get(id)) pending.delete(id);
          deferred.delete(id);
          versions.delete(id);
        }
        pendingLocalChanges = pending;
        deferredCommits = deferred;
        committedVersions = versions;
      }

      // Preserve selection: retain selected element IDs that still exist.
      const nextIdSet = new Set(elements.map((el) => el.id));
      const currentSelected = state.selectedElementIds.length > 0
        ? state.selectedElementIds
        : (state.selectedElementId ? [state.selectedElementId] : []);
      const retainedSelectedIds = currentSelected.filter((id) => nextIdSet.has(id));
      const retainedSelectedId = retainedSelectedIds.includes(state.selectedElementId || "")
        ? state.selectedElementId
        : retainedSelectedIds[0] ?? null;

      if (!changed && nextVersion === state.version && tombstones.size === state.deletedElementIds.size && pendingLocalChanges === state.pendingLocalChanges
          && committedVersions === state.committedVersions && deferredCommits === state.deferredCommits) {
        return state;
      }

      return {
        elements: changed ? elements : state.elements,
        deletedElementIds: tombstones,
        pendingLocalChanges,
        committedVersions,
        deferredCommits,
        version: nextVersion,
        selectedElementId: retainedSelectedId,
        selectedElementIds: retainedSelectedIds
      };
    }),
  appendRemotePoints: (elementId, points, bounds) =>
    set((state) => {
      if (points.length === 0) return state;
      if (state.deletedElementIds.has(elementId)) return state;
      // Never touch the element the local user is drawing/editing right now.
      if (state.editingElementId === elementId) return state;
      if (state.activeElementIds.has(elementId)) return state;

      const index = state.elements.findIndex((element) => element.id === elementId);
      if (index === -1) {
        if (!warnedUnknownElementIds.has(elementId)) {
          warnedUnknownElementIds.add(elementId);
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[collab] draw-progress for unknown element ${elementId}; requesting resync`);
          }
        }
        resyncHandler?.();
        return state;
      }

      const next = [...state.elements];
      const target = next[index];
      next[index] = {
        ...target,
        points: [...(target.points ?? []), ...points],
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };
      return { elements: next };
    }),
  setActiveElementIds: (ids) =>
    set((state) => {
      if (
        ids.length === state.activeElementIds.size &&
        ids.every((id) => state.activeElementIds.has(id))
      ) {
        return state;
      }
      return { activeElementIds: new Set(ids) };
    }),
  applyRemoteClear: () =>
    set((state) => {
      const tombstones = new Set(state.deletedElementIds);
      state.elements.forEach((element) => tombstones.add(element.id));
      return {
        elements: [],
        deletedElementIds: tombstones,
        selectedElementId: null,
        selectedElementIds: [],
        editingElementId: null,
        activeElementIds: new Set<string>()
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
        ...commitLocal(state, nextElements, updatedDeleted),
        deletedElementIds: updatedDeleted,
        selectedElementId: null,
        selectedElementIds: []
      };
    });
    return nextElements;
  },
  removeElements: (ids) => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (ids.length === 0) return state;
      const toDelete = new Set(ids);
      const updatedDeleted = new Set(state.deletedElementIds);
      ids.forEach((id) => updatedDeleted.add(id));

      nextElements = state.elements.filter((element) => !toDelete.has(element.id));
      return {
        ...commitLocal(state, nextElements, updatedDeleted),
        deletedElementIds: updatedDeleted,
        ...keepSelection(state, nextElements)
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
        ...withoutLayer(item),
        id: crypto.randomUUID(),
        x: item.x + offset.x,
        y: item.y + offset.y,
        points: item.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }))
      }));

      nextElements = [...state.elements, ...clones];
      const cloneIds = clones.map((c) => c.id);
      return {
        ...commitLocal(state, nextElements),
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
        ...withoutLayer(el),
        id: crypto.randomUUID(),
        x: el.x + offset,
        y: el.y + offset,
        points: el.points.map((p) => ({ x: p.x + offset, y: p.y + offset }))
      }));

      nextElements = [...state.elements, ...clones];
      const cloneIds = clones.map((c) => c.id);
      return {
        ...commitLocal(state, nextElements),
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
      const reordered = [...state.elements];
      for (let i = reordered.length - 2; i >= 0; i--) {
        if (idSet.has(reordered[i].id) && !idSet.has(reordered[i + 1].id)) {
          const temp = reordered[i];
          reordered[i] = reordered[i + 1];
          reordered[i + 1] = temp;
        }
      }
      const change = layerLocal(state, reordered);
      if (!change) return state;
      nextElements = change.elements;
      return change.patch;
    });
    return nextElements;
  },
  // F1.6: Z-order Send Backward
  sendBackward: () => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      if (state.selectedElementIds.length === 0) return state;
      const idSet = new Set(state.selectedElementIds);
      const reordered = [...state.elements];
      for (let i = 1; i < reordered.length; i++) {
        if (idSet.has(reordered[i].id) && !idSet.has(reordered[i - 1].id)) {
          const temp = reordered[i];
          reordered[i] = reordered[i - 1];
          reordered[i - 1] = temp;
        }
      }
      const change = layerLocal(state, reordered);
      if (!change) return state;
      nextElements = change.elements;
      return change.patch;
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
      const change = layerLocal(state, [...rest, ...moving]);
      if (!change) return state;
      nextElements = change.elements;
      return change.patch;
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
      const change = layerLocal(state, [...moving, ...rest]);
      if (!change) return state;
      nextElements = change.elements;
      return change.patch;
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
      // No undo step here: the pointer-up commit closes one step for the whole eraser stroke.
      trackLocal(state.elements, nextElements);
      return {
        elements: nextElements,
        ...markLocalChanges(state, nextElements, updatedDeleted),
        deletedElementIds: updatedDeleted,
        selectedElementId: null
      };
    });
    return nextElements;
  },
  clearBoard: () =>
    set((state) => {
      // Tombstone what is cleared so a stale snapshot cannot bring it back; undo restores it under new ids.
      const tombstones = new Set(state.deletedElementIds);
      state.elements.forEach((element) => tombstones.add(element.id));
      return {
        ...commitLocal(state, [], tombstones, "clear"),
        deletedElementIds: tombstones,
        selectedElementId: null,
        selectedElementIds: []
      };
    }),
  restoreElements: (elements) => {
    let nextElements: WhiteboardElement[] | null = null;
    set((state) => {
      const restored = restoreUnderNewIds(state.elements, state.deletedElementIds, elements);
      nextElements = restored ? sortByLayer(restored) : null;
      return nextElements ? commitLocal(state, nextElements) : state;
    });
    return nextElements;
  },
  undo: () => {
    let updated: WhiteboardElement[] | null = null;
    set((state) => {
      // Work that was never committed (for example text still being typed) becomes its own step first.
      const open = takeEntry(state.elements, state.deletedElementIds);
      const history = open ? pushEntry(state.history, open) : state.history;
      const entry = history[history.length - 1];
      if (!entry) return state;
      const result = applyEntry(state.elements, state.deletedElementIds, entry, "undo");
      updated = result.elements;
      return {
        elements: result.elements,
        deletedElementIds: result.tombstones,
        ...markLocalChanges(state, result.elements, result.tombstones),
        history: history.slice(0, -1),
        future: open ? [entry] : [entry, ...state.future],
        ...keepSelection(state, result.elements)
      };
    });
    return updated;
  },
  redo: () => {
    let updated: WhiteboardElement[] | null = null;
    set((state) => {
      // A new uncommitted local change makes the redo list meaningless, like any new action.
      const open = takeEntry(state.elements, state.deletedElementIds);
      if (open) return { history: pushEntry(state.history, open), future: [] };
      const [entry, ...remaining] = state.future;
      if (!entry) return state;
      const result = applyEntry(state.elements, state.deletedElementIds, entry, "redo");
      updated = result.elements;
      return {
        elements: result.elements,
        deletedElementIds: result.tombstones,
        ...markLocalChanges(state, result.elements, result.tombstones),
        history: [...state.history, entry],
        future: remaining,
        ...keepSelection(state, result.elements)
      };
    });
    return updated;
  },
  setViewport: (viewport) => set({ viewport }),
  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),
  setZoom: (zoom) => set((state) => ({ viewport: { ...state.viewport, zoom } })),
  upsertRemoteElement: (element) =>
    set((state) => {
      // Clean up warned unknown element tracking once element is received
      if (warnedUnknownElementIds.has(element.id)) {
        warnedUnknownElementIds.delete(element.id);
      }
      // Never resurrect something this board already deleted.
      if (state.deletedElementIds.has(element.id)) {
        return state;
      }
      // Preserve the shape currently under the local pointer or text editor.
      if (state.activeElementIds.has(element.id) || state.editingElementId === element.id) {
        return state;
      }
      const index = state.elements.findIndex((candidate) => candidate.id === element.id);
      if (index === -1) {
        return { elements: sortByLayer([...state.elements, element]) };
      }
      const nextElements = [...state.elements];
      nextElements[index] = element;
      // A peer's layer change arrives as a new layer number on the element.
      return { elements: sortByLayer(nextElements) };
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
        if (now - cursor.lastSeen <= 4000) {
          nextCursors[id] = cursor;
        } else {
          changed = true;
        }
      }
      return changed ? { remoteCursors: nextCursors } : state;
    }),
  setPresenceUsers: (presenceUsers) =>
    set((state) => {
      // Synchronize presence and immediately prune any remoteCursors for users who left
      const activeIds = new Set(presenceUsers.map((u) => u.userId));
      if (state.currentUserId) activeIds.add(state.currentUserId);
      const nextCursors: Record<string, StoredCursor> = {};
      for (const [id, cursor] of Object.entries(state.remoteCursors)) {
        if (activeIds.has(id)) {
          nextCursors[id] = cursor;
        }
      }
      return {
        presenceUsers,
        remoteCursors: nextCursors,
        followingUserId: state.followingUserId && !activeIds.has(state.followingUserId) ? null : state.followingUserId
      };
    }),
  addPresenceUser: (user) =>
    set((state) => ({
      presenceUsers: [
        ...state.presenceUsers.filter((u) => u.userId !== user.userId),
        user
      ]
    })),
  removePresenceUser: (userId) =>
    set((state) => {
      const nextCursors = { ...state.remoteCursors };
      delete nextCursors[userId];
      return {
        presenceUsers: state.presenceUsers.filter((u) => u.userId !== userId),
        remoteCursors: nextCursors,
        followingUserId: state.followingUserId === userId ? null : state.followingUserId
      };
    }),
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

// Dev-only inspection hook (never shipped to production builds): makes the
// live board state readable from the console/tests while debugging sync.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __boardStore?: typeof useBoardStore }).__boardStore = useBoardStore;
}

// Runs synchronously after every state change, so localHistory always knows which objects the store has held.
useBoardStore.subscribe((state, previous) => {
  if (state.elements !== previous.elements) rememberObjects(state.elements, previous.elements);
});
