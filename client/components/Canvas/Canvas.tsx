"use client";

import { CursorLayer } from "@/components/Cursor";
import { useCanvas } from "@/hooks/useCanvas";
import { uploadImage } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";
import { getNormalizedBounds, getContrastStrokeColor } from "@/components/Canvas/drawingUtils";
import type { CursorPosition, WhiteboardElement } from "@shared/types";
import { useEffect, useRef } from "react";

type CollaborationApi = {
  emitDraw: (element: WhiteboardElement) => void;
  emitElementUpdate: (element: WhiteboardElement) => void;
  emitCursor: (cursor: Omit<CursorPosition, "userId">) => void;
  emitReplace?: (elements: WhiteboardElement[]) => void;
  emitLaser?: (point: { x: number; y: number }, color?: string) => void;
};

type CanvasProps = {
  collaboration: CollaborationApi;
};

export function Canvas({ collaboration }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas = useCanvas({
    canvasRef,
    containerRef,
    collaboration
  });

  const editingElementId = useBoardStore((state) => state.editingElementId);
  const elements = useBoardStore((state) => state.elements);
  const viewport = useBoardStore((state) => state.viewport);
  const theme = useBoardStore((state) => state.theme);
  const setEditingElementId = useBoardStore((state) => state.setEditingElementId);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);

  const editingElement = elements.find((el) => el.id === editingElementId);

  const handleTextBlur = (text: string) => {
    setEditingElementId(null);
    if (!editingElement) return;

    const currentElements = useBoardStore.getState().elements;

    // For pure text elements, delete if empty. For sticky notes, retain.
    if (!text.trim() && editingElement.type === "text") {
      const nextElements = currentElements.filter((e) => e.id !== editingElementId);
      setElements(nextElements);
      commitElements(nextElements);
      collaboration.emitReplace?.(nextElements);
      return;
    }

    const nextElements = currentElements.map((el) => {
      if (el.id === editingElementId) {
        return {
          ...el,
          text,
          width: el.type === "text" ? Math.max(text.length * 14, 100) : el.width
        };
      }
      return el;
    });

    setElements(nextElements);
    commitElements(nextElements);
    const updatedElement = nextElements.find((e) => e.id === editingElementId);
    if (updatedElement) {
      collaboration.emitElementUpdate(updatedElement);
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (event.clientX - rect.left - viewport.x) / viewport.zoom;
    const y = (event.clientY - rect.top - viewport.y) / viewport.zoom;

    // Double click to edit text on any shape, sticky note, or text element
    const clickedElement = [...elements].reverse().find((el) => {
      const b = getNormalizedBounds(el);
      return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    });

    if (
      clickedElement &&
      (clickedElement.type === "text" ||
        clickedElement.type === "sticky" ||
        clickedElement.type === "rectangle" ||
        clickedElement.type === "circle")
    ) {
      setEditingElementId(clickedElement.id);
    }
  };

  // F1.4: Drag and drop image file onto canvas
  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    const dropX = rect ? (event.clientX - rect.left - viewport.x) / viewport.zoom : 100;
    const dropY = rect ? (event.clientY - rect.top - viewport.y) / viewport.zoom : 100;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;

      let finalUrl = dataUrl;
      try {
        const uploadRes = await uploadImage(dataUrl);
        if (uploadRes?.url) {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
          finalUrl = uploadRes.url.startsWith("http") ? uploadRes.url : `${apiBase}${uploadRes.url}`;
        }
      } catch {
        // Fallback to dataUrl
      }

      const imgEl: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "image",
        x: dropX - 150,
        y: dropY - 120,
        width: 300,
        height: 240,
        strokeColor: "#ffffff",
        strokeWidth: 1,
        imageUrl: finalUrl,
        points: []
      };

      const nextElements = [...elements, imgEl];
      commitElements(nextElements);
      collaboration.emitDraw(imgEl);
    };
    reader.readAsDataURL(file);
  };

  // F1.4: Clipboard paste image directly from clipboard
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            if (!dataUrl) return;

            let finalUrl = dataUrl;
            try {
              const res = await uploadImage(dataUrl);
              if (res?.url) {
                const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
                finalUrl = res.url.startsWith("http") ? res.url : `${apiBase}${res.url}`;
              }
            } catch {
              // fallback
            }

            const imgEl: WhiteboardElement = {
              id: crypto.randomUUID(),
              type: "image",
              x: -viewport.x / viewport.zoom + 200,
              y: -viewport.y / viewport.zoom + 200,
              width: 300,
              height: 240,
              strokeColor: "#ffffff",
              strokeWidth: 1,
              imageUrl: finalUrl,
              points: []
            };

            const nextElements = [...useBoardStore.getState().elements, imgEl];
            commitElements(nextElements);
            collaboration.emitDraw(imgEl);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [collaboration, commitElements, viewport]);

  return (
    <section
      className="canvas-shell"
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <canvas
        className="board-canvas"
        style={{ touchAction: "none" }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={canvas.handlePointerDown}
        onPointerMove={canvas.handlePointerMove}
        onPointerUp={canvas.handlePointerUp}
        onPointerCancel={canvas.handlePointerUp}
        onPointerLeave={canvas.handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={canvas.handleWheel}
        ref={canvasRef}
        aria-label="Interactive drawing canvas"
        role="region"
      />
      <CursorLayer />

      {editingElement && (
        <textarea
          ref={(el) => {
            if (el) {
              setTimeout(() => el.focus(), 10);
            }
          }}
          onBlur={(e) => handleTextBlur(e.target.value)}
          onChange={(e) => {
            const val = e.target.value;
            e.target.style.height = "auto";
            e.target.style.height = Math.max(editingElement.type === "sticky" ? 160 : 30, e.target.scrollHeight) + "px";
            if (editingElement.type !== "sticky") {
              e.target.style.width = "auto";
              e.target.style.width = Math.max(e.target.scrollWidth, 60) + "px";
            }
            // Auto-expand element height for multiline text or sticky note
            const lines = val.split("\n");
            const fontSize = editingElement.fontSize || (editingElement.type === "sticky" ? 18 : 20);
            const neededHeight = Math.max(
              editingElement.type === "sticky" ? 200 : fontSize * 1.5,
              lines.length * fontSize * 1.4 + 40
            );

            // Sync locally and emit element update in real-time
            const currentElements = useBoardStore.getState().elements;
            const nextElements = currentElements.map((el) =>
              el.id === editingElement.id ? { ...el, text: val, height: neededHeight } : el
            );
            setElements(nextElements);
            const targetEl = nextElements.find((el) => el.id === editingElement.id);
            if (targetEl) {
              collaboration.emitElementUpdate(targetEl);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              handleTextBlur(e.currentTarget.value);
            }
            // Commit on Cmd+Enter / Ctrl+Enter; regular Enter adds newline
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleTextBlur(e.currentTarget.value);
            }
          }}
          defaultValue={editingElement.text}
          style={{
            position: "absolute",
            top:
              editingElement.type === "sticky"
                ? editingElement.y * viewport.zoom + viewport.y + 16 * viewport.zoom
                : editingElement.type === "rectangle" || editingElement.type === "circle"
                ? (editingElement.y + (editingElement.height || 60) / 2) * viewport.zoom + viewport.y - 14 * viewport.zoom
                : editingElement.y * viewport.zoom + viewport.y,
            left:
              editingElement.type === "sticky"
                ? editingElement.x * viewport.zoom + viewport.x + 16 * viewport.zoom
                : editingElement.type === "rectangle" || editingElement.type === "circle"
                ? editingElement.x * viewport.zoom + viewport.x + 8 * viewport.zoom
                : editingElement.x * viewport.zoom + viewport.x,
            width:
              editingElement.type === "sticky"
                ? (editingElement.width - 32) * viewport.zoom + "px"
                : editingElement.type === "rectangle" || editingElement.type === "circle"
                ? (editingElement.width - 16) * viewport.zoom + "px"
                : "auto",
            height:
              editingElement.type === "sticky"
                ? (editingElement.height - 32) * viewport.zoom + "px"
                : editingElement.type === "rectangle" || editingElement.type === "circle"
                ? "28px"
                : "auto",
            textAlign: editingElement.type === "rectangle" || editingElement.type === "circle" ? "center" : "left",
            font: `${(editingElement.fontSize || (editingElement.type === "sticky" ? 18 : 20)) * viewport.zoom}px "Inter", "Segoe UI", sans-serif`,
            color: editingElement.type === "sticky" ? "#1e293b" : getContrastStrokeColor(editingElement.strokeColor, theme),
            background:
              editingElement.type === "sticky"
                ? "transparent"
                : theme === "light"
                ? "rgba(255, 255, 255, 0.95)"
                : "rgba(15, 23, 42, 0.75)",
            border:
              editingElement.type === "sticky"
                ? "none"
                : "1px dashed rgba(245, 158, 11, 0.8)",
            boxShadow:
              editingElement.type === "sticky"
                ? "none"
                : theme === "light"
                ? "0 2px 10px rgba(0, 0, 0, 0.12)"
                : "0 4px 12px rgba(0, 0, 0, 0.5)",
            borderRadius: "4px",
            outline: "none",
            resize: "none",
            margin: 0,
            padding: "2px",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
            zIndex: 50
          }}
        />
      )}
    </section>
  );
}
