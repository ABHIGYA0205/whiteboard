"use client";

import { useBoardStore } from "@/store/boardStore";
import type { ToolType, WhiteboardElement } from "@shared/types";
import { useEffect } from "react";

type UseKeyboardShortcutsOptions = {
  onClear: () => void;
  onReplace: (elements: WhiteboardElement[]) => void;
};

const SHORTCUT_TO_TOOL: Record<string, ToolType> = {
  v: "select",
  h: "pan",
  p: "pencil",
  r: "rectangle",
  o: "circle",
  l: "line",
  a: "arrow",
  t: "text",
  e: "eraser"
};

export function useKeyboardShortcuts({
  onClear,
  onReplace
}: UseKeyboardShortcutsOptions) {
  const tool = useBoardStore((state) => state.tool);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const setTool = useBoardStore((state) => state.setTool);
  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const deleteSelected = useBoardStore((state) => state.deleteSelected);
  const resetViewport = useBoardStore((state) => state.resetViewport);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
        return;
      }

      const key = event.key.toLowerCase();
      const isMeta = event.metaKey || event.ctrlKey;

      if (isMeta && key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }

      if (isMeta && key === "z") {
        event.preventDefault();
        undo();
        return;
      }

      if (isMeta && key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (key === "0") {
        event.preventDefault();
        resetViewport();
        return;
      }

      if ((key === "backspace" || key === "delete") && selectedElementId) {
        event.preventDefault();
        const nextElements = deleteSelected();
        if (nextElements) {
          onReplace(nextElements);
        }
        return;
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

      const nextTool = SHORTCUT_TO_TOOL[key];
      if (nextTool && nextTool !== tool) {
        event.preventDefault();
        setTool(nextTool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteSelected,
    onClear,
    onReplace,
    redo,
    resetViewport,
    selectedElementId,
    setTool,
    tool,
    undo
  ]);
}
