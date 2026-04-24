"use client";

import { CursorLayer } from "@/components/Cursor";
import { useCanvas } from "@/hooks/useCanvas";
import { useBoardStore } from "@/store/boardStore";
import type { CursorPosition, WhiteboardElement } from "@shared/types";
import { useRef } from "react";

type CollaborationApi = {
  emitDraw: (element: WhiteboardElement) => void;
  emitElementUpdate: (element: WhiteboardElement) => void;
  emitCursor: (cursor: Omit<CursorPosition, "userId">) => void;
  emitReplace?: (elements: WhiteboardElement[]) => void;
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
  const setEditingElementId = useBoardStore((state) => state.setEditingElementId);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);

  const editingElement = elements.find((el) => el.id === editingElementId);

  const handleTextBlur = (text: string) => {
    setEditingElementId(null);
    if (!editingElement) return;
    
    if (!text.trim()) {
       const nextElements = elements.filter(e => e.id !== editingElementId);
       setElements(nextElements);
       commitElements(nextElements);
       collaboration.emitReplace?.(nextElements);
       return;
    }

    const nextElements = elements.map(el => {
      if (el.id === editingElementId) {
        return {
          ...el,
          text,
          width: Math.max(text.length * 14, 100)
        };
      }
      return el;
    });

    setElements(nextElements);
    commitElements(nextElements);
    const updatedElement = nextElements.find(e => e.id === editingElementId);
    if (updatedElement) {
       collaboration.emitElementUpdate(updatedElement);
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (event.clientX - rect.left - viewport.x) / viewport.zoom;
    const y = (event.clientY - rect.top - viewport.y) / viewport.zoom;
    
    // Reverse elements to find the topmost one
    const clickedTextElement = [...elements].reverse().find(el => {
      if (el.type !== "text") return false;
      return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height;
    });

    if (clickedTextElement) {
      setEditingElementId(clickedTextElement.id);
    }
  };

  return (
    <section className="canvas-shell" ref={containerRef}>
      <canvas
        className="board-canvas"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={canvas.handlePointerDown}
        onPointerMove={canvas.handlePointerMove}
        onPointerUp={canvas.handlePointerUp}
        onPointerLeave={canvas.handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={canvas.handleWheel}
        ref={canvasRef}
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
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
            e.target.style.width = 'auto';
            e.target.style.width = Math.max(e.target.scrollWidth, 50) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              handleTextBlur(e.currentTarget.value);
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleTextBlur(e.currentTarget.value);
            }
          }}
          defaultValue={editingElement.text}
          style={{
            position: "absolute",
            top: editingElement.y * viewport.zoom + viewport.y,
            left: editingElement.x * viewport.zoom + viewport.x,
            font: `${(editingElement.fontSize || 24) * viewport.zoom}px "Avenir Next", "Segoe UI", sans-serif`,
            color: editingElement.strokeColor,
            background: "rgba(15, 23, 42, 0.4)",
            border: "1px dashed rgba(245, 158, 11, 0.8)",
            borderRadius: "4px",
            outline: "none",
            resize: "none",
            margin: 0,
            padding: "2px",
            overflow: "hidden",
            whiteSpace: "pre",
            minWidth: "50px",
            minHeight: `${(editingElement.fontSize || 24) * viewport.zoom * 1.2}px`,
            zIndex: 50
          }}
        />
      )}
    </section>
  );
}
