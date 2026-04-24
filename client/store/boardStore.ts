"use client";

import type {
  CanvasViewport,
  CursorPosition,
  ToolType,
  WhiteboardElement
} from "@shared/types";
import { create } from "zustand";

type BoardState = {
  elements: WhiteboardElement[];
  history: WhiteboardElement[][];
  future: WhiteboardElement[][];
  tool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  selectedElementId: string | null;
  editingElementId: string | null;
  viewport: CanvasViewport;
  remoteCursors: Record<string, CursorPosition>;
  isLocked: boolean;
  setIsLocked: (isLocked: boolean) => void;
  setTool: (tool: ToolType) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setEditingElementId: (id: string | null) => void;
  setElements: (elements: WhiteboardElement[]) => void;
  commitElements: (
    elements: WhiteboardElement[],
    previousElements?: WhiteboardElement[]
  ) => void;
  loadBoard: (elements: WhiteboardElement[]) => void;
  replaceElements: (elements: WhiteboardElement[]) => void;
  syncElements: (elements: WhiteboardElement[]) => void;
  selectElement: (id: string | null) => void;
  deleteSelected: () => WhiteboardElement[] | null;
  eraseAtPoint: (point: { x: number; y: number }, hitTest: (point: { x: number; y: number }, element: WhiteboardElement) => boolean) => WhiteboardElement[] | null;
  clearBoard: () => void;
  undo: () => void;
  redo: () => void;
  setViewport: (viewport: CanvasViewport) => void;
  resetViewport: () => void;
  setZoom: (zoom: number) => void;
  upsertRemoteElement: (element: WhiteboardElement) => void;
  upsertRemoteCursor: (cursor: CursorPosition) => void;
};

export const useBoardStore = create<BoardState>((set) => ({
  elements: [],
  history: [],
  future: [],
  tool: "pencil",
  strokeColor: "#ececf1",
  fillColor: "transparent",
  strokeWidth: 2,
  selectedElementId: null,
  editingElementId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  remoteCursors: {},
  isLocked: false,
  setIsLocked: (isLocked) => set({ isLocked }),
  setTool: (tool) => set({ tool }),
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setFillColor: (fillColor) => set({ fillColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setEditingElementId: (editingElementId) => set({ editingElementId }),
  setElements: (elements) => set({ elements }),
  commitElements: (elements, previousElements) =>
    set((state) => ({
      elements,
      history: [...state.history, previousElements ?? state.elements],
      future: []
    })),
  loadBoard: (elements) =>
    set({
      elements,
      history: [],
      future: [],
      selectedElementId: null
    }),
  replaceElements: (elements) =>
    set((state) => ({
      elements,
      history: [...state.history, state.elements],
      future: []
    })),
  syncElements: (elements) =>
    set({
      elements,
      selectedElementId: null
    }),
  selectElement: (selectedElementId) => set({ selectedElementId }),
  deleteSelected: () => {
    let nextElements: WhiteboardElement[] | null = null;

    set((state) => {
      if (!state.selectedElementId) {
        return state;
      }

      nextElements = state.elements.filter(
        (element) => element.id !== state.selectedElementId
      );

      return {
        elements: nextElements,
        history: [...state.history, state.elements],
        future: [],
        selectedElementId: null
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

      if (!hoveredElement) {
        return state;
      }

      nextElements = state.elements.filter(
        (element) => element.id !== hoveredElement.id
      );

      return {
        elements: nextElements,
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
  undo: () =>
    set((state) => {
      const previous = state.history[state.history.length - 1];
      if (!previous) {
        return state;
      }

      return {
        elements: previous,
        history: state.history.slice(0, -1),
        future: [state.elements, ...state.future]
      };
    }),
  redo: () =>
    set((state) => {
      const [next, ...remaining] = state.future;
      if (!next) {
        return state;
      }

      return {
        elements: next,
        history: [...state.history, state.elements],
        future: remaining
      };
    }),
  setViewport: (viewport) => set({ viewport }),
  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),
  setZoom: (zoom) => set((state) => ({ viewport: { ...state.viewport, zoom } })),
  upsertRemoteElement: (element) =>
    set((state) => {
      const index = state.elements.findIndex((candidate) => candidate.id === element.id);
      if (index === -1) {
        return { elements: [...state.elements, element] };
      }

      const nextElements = [...state.elements];
      nextElements[index] = element;
      return { elements: nextElements };
    }),
  upsertRemoteCursor: (cursor) =>
    set((state) => ({
      remoteCursors: {
        ...state.remoteCursors,
        [cursor.userId]: cursor
      }
    }))
}));
