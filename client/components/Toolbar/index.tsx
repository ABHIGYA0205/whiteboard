"use client";

import { TOOL_OPTIONS } from "@/components/Canvas/tools";
import { exportSketchForAi, getNormalizedBounds } from "@/components/Canvas/drawingUtils";
import { uploadImage, resolveImageUrl } from "@/lib/api";
import { pickSketchElements } from "@/lib/sketchSelection";
import { useBoardStore } from "@/store/boardStore";
import { useState, useEffect, useRef } from "react";
import type { WhiteboardElement } from "@shared/types";
import { AiImageModal } from "@/components/Modals/AiImageModal";
import {
  MousePointer2,
  Hand,
  Pencil,
  Square,
  Circle,
  Minus,
  MoveUpRight,
  Type,
  Eraser,
  Lock,
  Image as ImageIcon,
  Palette,
  StickyNote,
  Crosshair,
  LayoutTemplate,
  Workflow,
  Wand2,
  Diamond,
  MoreHorizontal,
  X
} from "lucide-react";

const TOOL_ICONS: Record<string, React.ReactNode> = {
  select: <MousePointer2 size={18} />,
  pan: <Hand size={18} />,
  pencil: <Pencil size={18} />,
  rectangle: <Square size={18} />,
  diamond: <Diamond size={18} />,
  circle: <Circle size={18} />,
  line: <Minus size={18} />,
  arrow: <MoveUpRight size={18} />,
  text: <Type size={18} />,
  sticky: <StickyNote size={18} />,
  image: <ImageIcon size={18} />,
  eraser: <Eraser size={18} />,
  laser: <Crosshair size={18} />
};

const PRIMARY_TOOLS = [
  { id: "select", label: "Selection", shortcut: "V" },
  { id: "pan", label: "Hand (Panning tool)", shortcut: "H" },
  { id: "pencil", label: "Draw", shortcut: "P" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "arrow", label: "Arrow", shortcut: "A" },
  { id: "text", label: "Text", shortcut: "T" }
] as const;

const SECONDARY_TOOLS = [
  { id: "circle", label: "Ellipse", shortcut: "O" },
  { id: "diamond", label: "Diamond", shortcut: "D" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "sticky", label: "Sticky Note", shortcut: "N" },
  { id: "image", label: "Insert Image", shortcut: "I" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
  { id: "laser", label: "Laser Pointer", shortcut: "K" }
] as const;

type ToolbarProps = {
  collaboration?: {
    emitDraw: (element: WhiteboardElement) => void;
    emitReplace: (elements: WhiteboardElement[]) => void;
    emitElementUpdate: (element: WhiteboardElement) => void;
  };
  onOpenTemplates?: () => void;
  onOpenAiDiagram?: () => void;
  isViewer?: boolean;
};

export function Toolbar({ collaboration, onOpenTemplates, onOpenAiDiagram, isViewer = false }: ToolbarProps) {
  const [imageError, setImageError] = useState<string | null>(null);
  const [isAiImageModalOpen, setIsAiImageModalOpen] = useState(false);
  const [modalPrompt, setModalPrompt] = useState("");
  const [modalSketchBase64, setModalSketchBase64] = useState<string | undefined>(undefined);
  const [modalIsClusterUsed, setModalIsClusterUsed] = useState(false);
  const [modalBounds, setModalBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const strokeColor = useBoardStore((state) => state.strokeColor);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const selectedElementIds = useBoardStore((state) => state.selectedElementIds);
  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);
  const commitElements = useBoardStore((state) => state.commitElements);
  const selectElement = useBoardStore((state) => state.selectElement);
  const isLocked = useBoardStore((state) => state.isLocked);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);
  const isPropertiesOpen = useBoardStore((state) => state.isPropertiesOpen);
  const togglePropertiesOpen = useBoardStore((state) => state.togglePropertiesOpen);

  useEffect(() => {
    if (isViewer && tool !== "select" && tool !== "pan") {
      setTool("select");
    }
  }, [isViewer, tool, setTool]);

  const isToolDisabled = (toolId: string) => isViewer && toolId !== "select" && toolId !== "pan";

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isViewer || isLocked) return;

    setImageError(null);
    if (file.size > 8 * 1024 * 1024) {
      setImageError("Choose an image smaller than 8 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setImageError("Could not read the image.");
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;

      const image = new Image();
      image.src = dataUrl;
      try {
        await image.decode();
      } catch {
        setImageError("Could not open this image. Choose a PNG, JPEG, WebP, GIF, or SVG file.");
        return;
      }

      let finalUrl = dataUrl;
      try {
        finalUrl = (await uploadImage(dataUrl)).url;
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status && status < 500) {
          setImageError(error instanceof Error ? error.message : "Could not upload the image.");
          return;
        }
        // Keep the image on the canvas if offline. Autosave uploads it after reconnect.
      }

      const state = useBoardStore.getState();
      if (state.isLocked) return;
      const { viewport } = state;
      const scale = Math.min(320 / image.naturalWidth, 240 / image.naturalHeight);
      const imageElement: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: "image",
        x: -viewport.x / viewport.zoom + 150,
        y: -viewport.y / viewport.zoom + 150,
        width: image.naturalWidth * scale,
        height: image.naturalHeight * scale,
        strokeColor: "#ffffff",
        strokeWidth: 1,
        imageUrl: finalUrl,
        points: []
      };

      commitElements([...state.elements, imageElement]);
      collaboration?.emitDraw(imageElement);
      setTool("select");
      selectElement(imageElement.id);
    };
    reader.readAsDataURL(file);
  };

  const handleEnhance = () => {
    const { elements } = useBoardStore.getState();
    const activeSelectedIds = selectedElementIds.length > 0
      ? selectedElementIds
      : (selectedElementId ? [selectedElementId] : []);

    const selection = pickSketchElements(elements, activeSelectedIds);
    const targetElements = selection.some((el) => el.type !== "text" && el.type !== "sticky") ? selection : [];
    // The cluster rule was used when the sketch is not (part of) the selection, for example because
    // only a picture was selected.
    const selectedIdSet = new Set(activeSelectedIds);
    const isClusterUsed = targetElements.length > 0 && !targetElements.some((el) => selectedIdSet.has(el.id));

    let detectedPrompt = selection.find((el) => activeSelectedIds.includes(el.id) && el.text?.trim())?.text?.trim() ?? "";
    let sketchBase64: string | undefined = undefined;
    let bounds: { x: number; y: number; width: number; height: number } | null = null;

    if (targetElements.length > 0) {
      const sketchResult = exportSketchForAi(targetElements);
      sketchBase64 = sketchResult?.dataUrl || undefined;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of targetElements) {
        const b = getNormalizedBounds(el);
        if (el.type === "pencil" && el.points && el.points.length > 0) {
          for (const pt of el.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
        } else {
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        }
      }

      if (minX !== Infinity && maxX !== -Infinity) {
        bounds = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
      }

      // Check for nearby text to suggest prompt
      const textElements = elements.filter(
        (el) =>
          (el.type === "text" || el.type === "sticky" || el.type === "rectangle") &&
          el.text?.trim()
      );

      if (!detectedPrompt && textElements.length > 0 && bounds) {
        const clusterCenter = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2
        };

        let minDistance = Infinity;
        for (const textEl of textElements) {
          const textBox = getNormalizedBounds(textEl);
          const textCenter = {
            x: textBox.x + textBox.width / 2,
            y: textBox.y + textBox.height / 2
          };
          const distance = Math.hypot(
            clusterCenter.x - textCenter.x,
            clusterCenter.y - textCenter.y
          );

          if (distance < minDistance && textEl.text) {
            minDistance = distance;
            detectedPrompt = textEl.text.trim();
          }
        }
      }
    }

    setModalPrompt(detectedPrompt);
    setModalSketchBase64(sketchBase64);
    setModalIsClusterUsed(isClusterUsed);
    setModalBounds(bounds);
    setIsAiImageModalOpen(true);
  };

  const handleImageGenerated = (imageUrl: string, naturalWidth: number, naturalHeight: number) => {
    const { viewport } = useBoardStore.getState();
    // 2.4: Size: Height = clamp(sketch bounding-box height, 240, 600), or 400 without sketch.
    // Width = height * naturalWidth / naturalHeight. Never stretch.
    const targetHeight = modalBounds
      ? Math.min(600, Math.max(240, modalBounds.height))
      : 400;
    const aspect = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
    const targetWidth = targetHeight * aspect;

    // Position: 40 px to the right of the sketch bounding box, top-aligned. Without a sketch, keep viewport position.
    const originX = modalBounds
      ? modalBounds.x + modalBounds.width + 40
      : -viewport.x / viewport.zoom + 220;
    const originY = modalBounds
      ? modalBounds.y
      : -viewport.y / viewport.zoom + 160;

    const finalImageUrl = resolveImageUrl(imageUrl);

    const imgEl: WhiteboardElement = {
      id: crypto.randomUUID(),
      type: "image",
      x: originX,
      y: originY,
      width: targetWidth,
      height: targetHeight,
      strokeColor: "#ffffff",
      strokeWidth: 1,
      imageUrl: finalImageUrl,
      points: []
    };

    // Never remove or replace elements. Append one image element with commitElements, emitDraw, select it.
    const nextElements = [...useBoardStore.getState().elements, imgEl];
    commitElements(nextElements);
    collaboration?.emitDraw(imgEl);
    setTool("select");
    selectElement(imgEl.id);
  };

  return (
    <>
      <input
        type="file"
        ref={imageInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handleImageFileChange}
      />

      <nav className="top-toolbar" aria-label="Drawing tools and controls">
        {/* Desktop View */}
        <div className="toolbar-desktop-view">
          <button
            className={`tool-button ${isLocked ? "active" : ""}`}
            title={isLocked ? "Unlock Canvas" : "Lock Canvas"}
            aria-label={isLocked ? "Unlock Canvas" : "Lock Canvas"}
            onClick={() => setIsLocked(!isLocked)}
          >
            <Lock size={16} />
          </button>

          <div className="menu-divider" style={{ width: "1px", height: "24px", margin: "0 4px", background: "rgba(255,255,255,0.1)" }} />

          {TOOL_OPTIONS.map((option) => (
            <button
              className={`tool-button ${tool === option.id ? "active" : ""}`}
              key={option.id}
              disabled={isToolDisabled(option.id)}
              style={
                isToolDisabled(option.id)
                  ? { opacity: 0.35, cursor: "not-allowed" }
                  : undefined
              }
              onClick={() => {
                if (isToolDisabled(option.id)) return;
                if (option.id === "image") {
                  imageInputRef.current?.click();
                } else {
                  setTool(option.id);
                }
              }}
              title={`${option.label} (${option.shortcut})`}
              aria-label={`${option.label} tool, shortcut ${option.shortcut}`}
            >
              {TOOL_ICONS[option.id]}
              <span className="tool-shortcut">{option.shortcut}</span>
            </button>
          ))}

          {/* Integrated Style & Color Properties Button */}
          <button
            className={`tool-button ${isPropertiesOpen ? "active" : ""}`}
            onClick={() => togglePropertiesOpen()}
            title="Style & Properties (S)"
            aria-label="Toggle stroke and fill properties"
            aria-expanded={isPropertiesOpen}
            style={{ position: "relative" }}
          >
            <Palette size={16} />
            <span
              style={{
                position: "absolute",
                bottom: "4px",
                right: "4px",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: strokeColor === "transparent" ? "#94a3b8" : strokeColor,
                border: "1.5px solid #181824"
              }}
            />
          </button>

          <div className="menu-divider" style={{ width: "1px", height: "24px", margin: "0 4px", background: "rgba(255,255,255,0.1)" }} />

          <button className="tool-button" onClick={handleEnhance} disabled={isViewer}
            title="Generate image" aria-label="Generate image">
            <Wand2 size={17} />
          </button>

          {/* Templates gallery button */}
          <button
            className="tool-button"
            onClick={onOpenTemplates}
            title="Whiteboard Templates (Flowchart, Kanban, Retro, Mind Map)"
            aria-label="Open Whiteboard Templates"
          >
            <LayoutTemplate size={16} />
          </button>

          {/* AI Prompt to Diagram button */}
          <button
            className="tool-button"
            onClick={onOpenAiDiagram}
            title="Create diagram"
            aria-label="Generate editable diagram from text prompt"
          >
            <Workflow size={16} />
          </button>
        </div>

        {/* Compact View */}
        <div className="toolbar-mobile-view">
          {PRIMARY_TOOLS.map((option) => (
            <button
              className={`tool-button ${tool === option.id ? "active" : ""}`}
              key={option.id}
              disabled={isToolDisabled(option.id)}
              style={
                isToolDisabled(option.id)
                  ? { opacity: 0.35, cursor: "not-allowed" }
                  : undefined
              }
              onClick={() => {
                if (isToolDisabled(option.id)) return;
                setTool(option.id);
              }}
              title={`${option.label} (${option.shortcut})`}
              aria-label={`${option.label} tool, shortcut ${option.shortcut}`}
            >
              {TOOL_ICONS[option.id]}
            </button>
          ))}

          {/* Style & Properties Button */}
          <button
            className={`tool-button ${isPropertiesOpen ? "active" : ""}`}
            onClick={() => togglePropertiesOpen()}
            title="Style & Properties (S)"
            aria-label="Toggle stroke and fill properties"
            aria-expanded={isPropertiesOpen}
            style={{ position: "relative" }}
          >
            <Palette size={16} />
            <span
              style={{
                position: "absolute",
                bottom: "4px",
                right: "4px",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: strokeColor === "transparent" ? "#94a3b8" : strokeColor,
                border: "1.5px solid #181824"
              }}
            />
          </button>

          {/* More Tools Popover */}
          <div className="more-menu-wrapper" ref={moreDropdownRef} style={{ position: "relative" }}>
            <button
              className={`tool-button tool-more-btn ${isMoreOpen || SECONDARY_TOOLS.some((t) => t.id === tool) ? "active" : ""}`}
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              title="More Tools"
              aria-label="More tools and actions"
              aria-expanded={isMoreOpen}
            >
              <MoreHorizontal size={18} />
              {SECONDARY_TOOLS.some((t) => t.id === tool) && (
                <span
                  style={{
                    position: "absolute",
                    top: "3px",
                    right: "3px",
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: "#818cf8"
                  }}
                />
              )}
            </button>

            {isMoreOpen && (
              <div className="more-tools-popover" role="menu" aria-label="More whiteboard tools">
                <div className="more-tools-header">More Tools</div>
                <div className="more-tools-grid">
                  {SECONDARY_TOOLS.map((option) => (
                    <button
                      key={option.id}
                      className={`more-tool-item ${tool === option.id ? "active" : ""}`}
                      disabled={isToolDisabled(option.id)}
                      style={
                        isToolDisabled(option.id)
                          ? { opacity: 0.35, cursor: "not-allowed" }
                          : undefined
                      }
                      onClick={() => {
                        if (isToolDisabled(option.id)) return;
                        setIsMoreOpen(false);
                        if (option.id === "image") {
                          imageInputRef.current?.click();
                        } else {
                          setTool(option.id);
                        }
                      }}
                      title={`${option.label} (${option.shortcut})`}
                      aria-label={`${option.label} tool, shortcut ${option.shortcut}`}
                    >
                      <span className="more-tool-icon">{TOOL_ICONS[option.id]}</span>
                      <span className="more-tool-label">{option.label}</span>
                    </button>
                  ))}
                </div>

                <div className="more-tools-divider" />

                <div className="more-tools-actions">
                  <button
                    className={`more-action-item ${isLocked ? "active" : ""}`}
                    onClick={() => {
                      setIsLocked(!isLocked);
                      setIsMoreOpen(false);
                    }}
                    aria-label={isLocked ? "Unlock Canvas" : "Lock Canvas"}
                  >
                    <Lock size={15} />
                    <span>{isLocked ? "Unlock Canvas" : "Lock Canvas"}</span>
                  </button>

                  <button
                    className="more-action-item"
                    onClick={() => {
                      onOpenTemplates?.();
                      setIsMoreOpen(false);
                    }}
                    aria-label="Open Whiteboard Templates"
                  >
                    <LayoutTemplate size={15} />
                    <span>Templates</span>
                  </button>

                  <button
                    className="more-action-item"
                    onClick={() => {
                      onOpenAiDiagram?.();
                      setIsMoreOpen(false);
                    }}
                    aria-label="AI Prompt to Diagram"
                  >
                    <Workflow size={15} />
                    <span>Create diagram</span>
                  </button>

                  <button
                    className="more-action-item"
                    onClick={() => {
                      handleEnhance();
                      setIsMoreOpen(false);
                    }}
                    disabled={isViewer}
                    aria-label="Generate image"
                  >
                    <Wand2 size={15} />
                    <span>Generate image</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Floating error notification below toolbar */}
      {imageError && (
        <div
          style={{
            position: "fixed",
            top: "68px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(38, 18, 22, 0.95)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(239, 68, 68, 0.5)",
            color: "#fca5a5",
            padding: "8px 16px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: 500,
            zIndex: 120,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
          role="alert"
        >
          <span>{imageError}</span>
          <button type="button" aria-label="Dismiss image error" onClick={() => setImageError(null)}><X size={16} /></button>
        </div>
      )}

      {/* Modern AI Image Generation & Enhancement Modal */}
      <AiImageModal
        isOpen={isAiImageModalOpen}
        onClose={() => setIsAiImageModalOpen(false)}
        initialPrompt={modalPrompt}
        sketchBase64={modalSketchBase64}
        isClusterUsed={modalIsClusterUsed}
        onGenerate={handleImageGenerated}
      />
    </>
  );
}
