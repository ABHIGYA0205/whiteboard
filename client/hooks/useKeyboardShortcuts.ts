"use client";

import { useBoardStore } from "@/store/boardStore";
import type { ToolType, WhiteboardElement } from "@shared/types";
import { useEffect } from "react";

type UseKeyboardShortcutsOptions = {
  onClear: () => void;
  onReplace: (elements: WhiteboardElement[]) => void;
  onShowShortcuts?: () => void;
};

const SHORTCUT_TO_TOOL: Record<string, ToolType> = {
  v: "select",
  h: "pan",
  p: "pencil",
  r: "rectangle",
  d: "diamond",
  o: "circle",
  l: "line",
  a: "arrow",
  t: "text",
  e: "eraser",
  i: "image",
  n: "sticky",
  k: "laser"
};

export function useKeyboardShortcuts({
  onClear,
  onReplace,
  onShowShortcuts
}: UseKeyboardShortcutsOptions) {
  const tool = useBoardStore((state) => state.tool);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const selectedElementIds = useBoardStore((state) => state.selectedElementIds);
  const setTool = useBoardStore((state) => state.setTool);
  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const deleteSelected = useBoardStore((state) => state.deleteSelected);
  const copySelected = useBoardStore((state) => state.copySelected);
  const paste = useBoardStore((state) => state.paste);
  const duplicateSelected = useBoardStore((state) => state.duplicateSelected);
  const bringForward = useBoardStore((state) => state.bringForward);
  const sendBackward = useBoardStore((state) => state.sendBackward);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const sendToBack = useBoardStore((state) => state.sendToBack);
  const resetViewport = useBoardStore((state) => state.resetViewport);
  const selectElement = useBoardStore((state) => state.selectElement);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isTyping =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        Boolean(activeEl?.isContentEditable) ||
        Boolean(useBoardStore.getState().editingElementId);

      if (isTyping) {
        return;
      }

      const key = event.key.toLowerCase();
      const isMeta = event.metaKey || event.ctrlKey;

      // Select all elements on canvas (Cmd+A / Ctrl+A)
      if (isMeta && key === "a") {
        event.preventDefault();
        const allElements = useBoardStore.getState().elements;
        selectElement(allElements.map((el) => el.id));
        return;
      }

      if (isMeta && key === "z" && event.shiftKey) {
        event.preventDefault();
        const next = redo();
        if (next) onReplace(next);
        return;
      }

      if (isMeta && key === "z") {
        event.preventDefault();
        const next = undo();
        if (next) onReplace(next);
        return;
      }

      if (isMeta && key === "y") {
        event.preventDefault();
        const next = redo();
        if (next) onReplace(next);
        return;
      }

      // F1.2: Copy
      if (isMeta && key === "c") {
        if (selectedElementIds.length > 0) {
          copySelected();
        }
        return;
      }

      // F1.2: Paste
      if (isMeta && key === "v") {
        event.preventDefault();
        const next = paste();
        if (next) onReplace(next);
        return;
      }

      // F1.2: Duplicate
      if (isMeta && key === "d") {
        event.preventDefault();
        if (selectedElementIds.length > 0) {
          const next = duplicateSelected();
          if (next) onReplace(next);
        }
        return;
      }

      // F1.6: Z-order controls
      if (event.shiftKey && event.key === "]") {
        event.preventDefault();
        const next = bringToFront();
        if (next) onReplace(next);
        return;
      }

      if (event.shiftKey && event.key === "[") {
        event.preventDefault();
        const next = sendToBack();
        if (next) onReplace(next);
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        const next = bringForward();
        if (next) onReplace(next);
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        const next = sendBackward();
        if (next) onReplace(next);
        return;
      }

      if (key === "0") {
        event.preventDefault();
        resetViewport();
        return;
      }

      if ((key === "backspace" || key === "delete") && selectedElementIds.length > 0) {
        event.preventDefault();
        const nextElements = deleteSelected();
        if (nextElements) {
          onReplace(nextElements);
        }
        return;
      }

      if (key === "enter" && selectedElementId) {
        const el = useBoardStore.getState().elements.find((e) => e.id === selectedElementId);
        if (
          el &&
          (el.type === "text" ||
            el.type === "sticky" ||
            el.type === "rectangle" ||
            el.type === "circle")
        ) {
          event.preventDefault();
          useBoardStore.getState().setEditingElementId(el.id);
          return;
        }
      }

      if (key === "escape") {
        event.preventDefault();
        setTool("select");
        return;
      }

      if (key === "x") {
        event.preventDefault();
        onClear();
        return;
      }

      // F1.13: Help dialog shortcut
      if (event.key === "?" || (key === "/" && event.shiftKey)) {
        event.preventDefault();
        onShowShortcuts?.();
        return;
      }

      const nextTool = SHORTCUT_TO_TOOL[key];
      if (nextTool && nextTool !== tool) {
        event.preventDefault();
        setTool(nextTool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    bringForward,
    bringToFront,
    copySelected,
    deleteSelected,
    duplicateSelected,
    onClear,
    onReplace,
    onShowShortcuts,
    paste,
    redo,
    resetViewport,
    selectedElementId,
    selectedElementIds,
    sendBackward,
    sendToBack,
    setTool,
    tool,
    undo
  ]);
}
