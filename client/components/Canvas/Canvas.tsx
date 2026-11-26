"use client";

import { CursorLayer } from "@/components/Cursor";
import { useCanvas } from "@/hooks/useCanvas";
import { uploadImage, resolveImageUrl } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";
import { BOARD_TEXT_FONT, getNormalizedBounds, getContrastStrokeColor } from "@/components/Canvas/drawingUtils";
import type { CursorPosition, WhiteboardElement } from "@shared/types";
import { useEffect, useRef } from "react";

type CollaborationApi = {
  emitDraw: (element: WhiteboardElement) => void;
  emitElementUpdate: (element: WhiteboardElement) => void;
  emitCursor: (cursor: Omit<CursorPosition, "userId">) => void;
  emitCursorLeave?: () => void;
  flushPointerUpdates?: () => void;
  emitReplace?: (elements: WhiteboardElement[]) => void;
  emitLaser?: (point: { x: number; y: number }, color?: string) => void;
  requestResync?: () => void;
};

type CanvasProps = {
  collaboration: CollaborationApi;
};

function updateElementText(element: WhiteboardElement, text: string): WhiteboardElement {
  if (element.type !== "text") return { ...element, text };
  const { width, height } = getNormalizedBounds({ ...element, text, width: 0, height: 0 });
  return { ...element, text, width, height };
}

export function Canvas({ collaboration }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas = useCanvas({
    canvasRef,
    containerRef,
    collaboration
  });

  const editingElementId = useBoardStore((state) => state.editingElementId);
  const editingElement = useBoardStore((state) => state.editingElementId
    ? state.elements.find((element) => element.id === state.editingElementId)
    : undefined);
  const viewport = useBoardStore((state) => state.viewport);
  const theme = useBoardStore((state) => state.theme);
  const setEditingElementId = useBoardStore((state) => state.setEditingElementId);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingElementId) textareaRef.current?.focus({ preventScroll: true });
  }, [editingElementId]);

  const handleTextBlur = (text: string) => {
    setEditingElementId(null);
    if (!editingElement) return;

    const currentElements = useBoardStore.getState().elements;

    // For pure text elements, delete if empty. For sticky notes, retain.
    // The delete must be a real one (with a tombstone): every keystroke was already sent to the
    // other users, so just dropping the element here would leave an invisible empty box on their
    // screens and in storage, from where it would also come back to this screen.
    if (!text.trim() && editingElement.type === "text") {
      const nextElements = useBoardStore.getState().removeElements([editingElement.id]);
      if (nextElements) collaboration.emitReplace?.(nextElements);
      return;
    }

    const nextElements = currentElements.map((el) =>
      el.id === editingElementId ? updateElementText(el, text) : el
    );

    setElements(nextElements);
    commitElements(nextElements);
    const updatedElement = nextElements.find((e) => e.id === editingElementId);
    if (updatedElement) {
      collaboration.emitElementUpdate(updatedElement);
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (useBoardStore.getState().isLocked) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (event.clientX - rect.left - viewport.x) / viewport.zoom;
    const y = (event.clientY - rect.top - viewport.y) / viewport.zoom;

    // Double click to edit text on any shape, sticky note, or text element
    const clickedElement = [...useBoardStore.getState().elements].reverse().find((el) => {
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
    if (useBoardStore.getState().isLocked) return;
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
          finalUrl = resolveImageUrl(uploadRes.url);
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

      const nextElements = [...useBoardStore.getState().elements, imgEl];
      commitElements(nextElements);
      collaboration.emitDraw(imgEl);
    };
    reader.readAsDataURL(file);
  };

  // F1.4: Clipboard paste image directly from clipboard
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (useBoardStore.getState().isLocked) return;
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
                finalUrl = resolveImageUrl(res.url);
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

  let editorStyle: React.CSSProperties | undefined;
  if (editingElement) {
    const bounds = getNormalizedBounds(editingElement);
    const isText = editingElement.type === "text";
    const isSticky = editingElement.type === "sticky";
    const centered = !isText && !isSticky;
    const fontSize = (editingElement.fontSize || (isSticky ? 18 : isText ? 24 : 16)) * viewport.zoom;
    const lineHeight = fontSize * (isText ? 1.2 : 1.3);
    const lineCount = (editingElement.text || "").split("\n").length;
    const inset = (isSticky ? 16 : centered ? 8 : 0) * viewport.zoom;
    const height = isSticky ? Math.max(lineHeight, bounds.height * viewport.zoom - inset * 2) : lineCount * lineHeight;
    editorStyle = {
      left: bounds.x * viewport.zoom + viewport.x + inset,
      top: bounds.y * viewport.zoom + viewport.y + (centered ? (bounds.height * viewport.zoom - height) / 2 : inset),
      width: Math.max(12, bounds.width * viewport.zoom - inset * 2 + (isText ? fontSize : 0)),
      height: Math.max(12, height),
      fontFamily: BOARD_TEXT_FONT,
      fontSize,
      lineHeight: `${lineHeight}px`,
      textAlign: centered ? "center" : "left",
      color: isSticky ? "#1e293b" : getContrastStrokeColor(editingElement.strokeColor, theme)
    };
  }

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
        onPointerLeave={(event) => {
          collaboration.emitCursorLeave?.();
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) canvas.handlePointerUp(event);
        }}
        onDoubleClick={handleDoubleClick}
        ref={canvasRef}
        aria-label="Interactive drawing canvas"
        role="region"
      />
      <CursorLayer />

      {editingElement && (
        <textarea
          key={editingElement.id}
          ref={textareaRef}
          className="canvas-text-editor"
          aria-label="Edit canvas text"
          wrap={editingElement.type === "text" ? "off" : "soft"}
          onBlur={(event) => handleTextBlur(event.currentTarget.value)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            const nextElements = useBoardStore.getState().elements.map((el) =>
              el.id === editingElement.id ? updateElementText(el, text) : el
            );
            setElements(nextElements);
            const target = nextElements.find((el) => el.id === editingElement.id);
            if (target) collaboration.emitElementUpdate(target);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          defaultValue={editingElement.text}
          style={editorStyle}
        />
      )}
    </section>
  );
}
