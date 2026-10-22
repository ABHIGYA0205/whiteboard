"use client";

import { TOOL_OPTIONS } from "@/components/Canvas/tools";
import { exportSelectionToImage, getNormalizedBounds } from "@/components/Canvas/drawingUtils";
import { enhanceSketch, uploadImage, resolveImageUrl } from "@/lib/api";
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
  Sparkles,
  Lock,
  Image as ImageIcon,
  Trash2,
  ChevronDown,
  Palette,
  Flame,
  Zap,
  Box,
  Laptop,
  Paintbrush,
  StickyNote,
  Crosshair,
  LayoutTemplate,
  Workflow,
  Check,
  Diamond
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

const getPaletteColors = (theme: "dark" | "light") => [
  { name: theme === "light" ? "Black" : "White", value: theme === "light" ? "#1e293b" : "#ececf1" },
  { name: "Red", value: "#ff4444" },
  { name: "Orange", value: "#ff9500" },
  { name: "Yellow", value: "#ffcc00" },
  { name: "Green", value: "#34c759" },
  { name: "Blue", value: "#007aff" },
  { name: "Purple", value: "#af52de" },
  { name: "Pink", value: "#ff2d55" }
];

const ENHANCE_STYLES = [
  { id: "digital", label: "Digital Art", promptSuffix: "Clean digital art, detailed, professional vector, smooth gradients" },
  { id: "sketch", label: "Pencil Sketch", promptSuffix: "Hand-drawn pencil sketch, graphite, fine details, shaded, textured paper" },
  { id: "oil", label: "Oil Painting", promptSuffix: "Rich oil painting, textured canvas, heavy brushstrokes, classical masterpiece" },
  { id: "anime", label: "Anime Style", promptSuffix: "Beautiful anime illustration, studio quality, vibrant colors, clean line art" },
  { id: "watercolor", label: "Watercolor", promptSuffix: "Soft watercolor painting, color splashes, bleeding ink, beautiful wash, artistic" },
  { id: "render", label: "3D Render", promptSuffix: "Stunning 3D clay render, Octane render, photorealistic, cinematic lighting, cute model" },
  { id: "cyberpunk", label: "Cyberpunk", promptSuffix: "Cyberpunk aesthetic, neon glow, futuristic cities, synthwave colors, dark atmospheric" }
];

const STYLE_ICONS: Record<string, React.ReactNode> = {
  digital: <Palette size={14} />,
  sketch: <Pencil size={14} />,
  oil: <Paintbrush size={14} />,
  anime: <Zap size={14} />,
  watercolor: <Flame size={14} />,
  render: <Box size={14} />,
  cyberpunk: <Laptop size={14} />
};

type ToolbarProps = {
  collaboration?: {
    emitDraw: (element: WhiteboardElement) => void;
    emitReplace: (elements: WhiteboardElement[]) => void;
    emitElementUpdate: (element: WhiteboardElement) => void;
  };
  onOpenTemplates?: () => void;
  onOpenAiDiagram?: () => void;
};

export function Toolbar({ collaboration, onOpenTemplates, onOpenAiDiagram }: ToolbarProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState(0);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const [selectedStyle, setSelectedStyle] = useState(ENHANCE_STYLES[0]);
  const [showStyleMenu, setShowStyleMenu] = useState(false);

  const [isAiImageModalOpen, setIsAiImageModalOpen] = useState(false);
  const [modalPrompt, setModalPrompt] = useState("");
  const [modalSketchBase64, setModalSketchBase64] = useState<string | undefined>(undefined);
  const [modalCluster, setModalCluster] = useState<WhiteboardElement[]>([]);
  const [modalBounds, setModalBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStyleMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isEnhancing) {
      setTimer(30);
      interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isEnhancing]);

  const strokeColor = useBoardStore((state) => state.strokeColor);
  const theme = useBoardStore((state) => state.theme);
  const setStrokeColor = useBoardStore((state) => state.setStrokeColor);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const selectedElementIds = useBoardStore((state) => state.selectedElementIds);
  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);
  const elements = useBoardStore((state) => state.elements);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const selectElement = useBoardStore((state) => state.selectElement);
  const isLocked = useBoardStore((state) => state.isLocked);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);
  const isPropertiesOpen = useBoardStore((state) => state.isPropertiesOpen);
  const togglePropertiesOpen = useBoardStore((state) => state.togglePropertiesOpen);
  const clearBoard = useBoardStore((state) => state.clearBoard);
  const viewport = useBoardStore((state) => state.viewport);

  // A6.4: Image Tool upload handler
  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;

      try {
        let finalUrl = dataUrl;
        try {
          const uploadRes = await uploadImage(dataUrl);
          if (uploadRes?.url) {
            finalUrl = resolveImageUrl(uploadRes.url);
          }
        } catch {
          // Fall back to direct data URL if server upload endpoint is unavailable
        }

        const worldX = -viewport.x / viewport.zoom + 150;
        const worldY = -viewport.y / viewport.zoom + 150;

        const imageElement: WhiteboardElement = {
          id: crypto.randomUUID(),
          type: "image",
          x: worldX,
          y: worldY,
          width: 320,
          height: 240,
          strokeColor: "#ffffff",
          strokeWidth: 1,
          imageUrl: finalUrl,
          points: []
        };

        const nextElements = [...elements, imageElement];
        commitElements(nextElements);
        collaboration?.emitDraw(imageElement);
        setTool("select");
        selectElement(imageElement.id);
      } catch (err) {
        console.error("Failed to load image", err);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleEnhance = () => {
    const drawingElements = elements.filter(
      (el) =>
        el.type === "pencil" ||
        el.type === "rectangle" ||
        el.type === "circle" ||
        el.type === "line" ||
        el.type === "arrow"
    );

    let seedElement = drawingElements[drawingElements.length - 1];
    if (selectedElementId) {
      const selected = drawingElements.find((el) => el.id === selectedElementId);
      if (selected) {
        seedElement = selected;
      }
    }

    let detectedPrompt = "";
    let sketchBase64: string | undefined = undefined;
    let clusterElements: WhiteboardElement[] = [];
    let bounds = null;

    if (seedElement) {
      const getBoundingBox = (el: WhiteboardElement) => {
        const b = getNormalizedBounds(el);
        if (el.type === "pencil") {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const pt of el.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
          return { minX, minY, maxX, maxY };
        } else {
          return {
            minX: b.x,
            minY: b.y,
            maxX: b.x + b.width,
            maxY: b.y + b.height
          };
        }
      };

      const getBoxCenter = (box: { minX: number; minY: number; maxX: number; maxY: number }) => ({
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2
      });

      const cluster = [seedElement];
      const remaining = drawingElements.filter((el) => el.id !== seedElement.id);
      const queue = [seedElement];
      const MAX_CLUSTER_DISTANCE = 400;

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentBox = getBoundingBox(current);
        const currentCenter = getBoxCenter(currentBox);

        for (let i = remaining.length - 1; i >= 0; i--) {
          const candidate = remaining[i];
          const candidateBox = getBoundingBox(candidate);
          const candidateCenter = getBoxCenter(candidateBox);

          const distance = Math.hypot(
            currentCenter.x - candidateCenter.x,
            currentCenter.y - candidateCenter.y
          );

          if (distance < MAX_CLUSTER_DISTANCE) {
            cluster.push(candidate);
            queue.push(candidate);
            remaining.splice(i, 1);
          }
        }
      }

      clusterElements = cluster;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of cluster) {
        const box = getBoundingBox(el);
        minX = Math.min(minX, box.minX);
        minY = Math.min(minY, box.minY);
        maxX = Math.max(maxX, box.maxX);
        maxY = Math.max(maxY, box.maxY);
      }

      bounds = {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 240),
        height: Math.max(maxY - minY, 240)
      };

      sketchBase64 = exportSelectionToImage(cluster) || undefined;

      const textElements = elements.filter(
        (el) =>
          (el.type === "text" || el.type === "sticky" || el.type === "rectangle") &&
          el.text?.trim()
      );

      if (textElements.length > 0) {
        const clusterCenter = {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2
        };

        let minDistance = Infinity;
        for (const textEl of textElements) {
          const textBox = getBoundingBox(textEl);
          const textCenter = getBoxCenter(textBox);
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
    setModalCluster(clusterElements);
    setModalBounds(bounds);
    setIsAiImageModalOpen(true);
  };

  const handleImageGenerated = (imageUrl: string, width: number, height: number) => {
    const originX = modalBounds ? modalBounds.x : -viewport.x / viewport.zoom + 220;
    const originY = modalBounds ? modalBounds.y : -viewport.y / viewport.zoom + 160;
    const finalWidth = modalBounds ? modalBounds.width : width;
    const finalHeight = modalBounds ? modalBounds.height : height;
    const finalImageUrl = resolveImageUrl(imageUrl);

    const imgEl: WhiteboardElement = {
      id: crypto.randomUUID(),
      type: "image",
      x: originX,
      y: originY,
      width: finalWidth,
      height: finalHeight,
      strokeColor: "#ffffff",
      strokeWidth: 1,
      imageUrl: finalImageUrl,
      points: []
    };

    let nextElements: WhiteboardElement[];
    if (modalCluster.length > 0) {
      const clusterIds = new Set(modalCluster.map((el) => el.id));
      nextElements = elements.filter((el) => !clusterIds.has(el.id));
      nextElements.push(imgEl);
    } else {
      nextElements = [...elements, imgEl];
    }

    commitElements(nextElements);
    collaboration?.emitReplace?.(nextElements);
    setTool("select");
    selectElement(imgEl.id);
  };

  const handleColorChange = (color: string) => {
    setStrokeColor(color);
    if (tool === "select" && selectedElementIds.length > 0) {
      const idSet = new Set(selectedElementIds);
      const nextElements = elements.map((el) =>
        idSet.has(el.id) ? { ...el, strokeColor: color } : el
      );
      setElements(nextElements);
      commitElements(nextElements);
      collaboration?.emitReplace(nextElements);
    }
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
            onClick={() => {
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

        {/* AI Enhancer and Style Selector */}
        <div className="ai-enhancer-group" ref={dropdownRef}>
          <button
            className={`ai-trigger-button ${isEnhancing ? "enhancing" : ""}`}
            onClick={handleEnhance}
            disabled={isEnhancing}
            title={`Enhance sketch with AI (${selectedStyle.label})`}
            aria-label={`Enhance sketch with AI using ${selectedStyle.label}`}
          >
            <Sparkles size={14} className="ai-sparkle-icon" />
            <span className="ai-btn-text">Enhance</span>
            <span className="ai-style-pill">{selectedStyle.label}</span>
          </button>

          <button
            className={`ai-dropdown-trigger ${showStyleMenu ? "active" : ""}`}
            disabled={isEnhancing}
            onClick={(e) => {
              e.stopPropagation();
              setShowStyleMenu(!showStyleMenu);
            }}
            title="Select AI Art Style Preset"
            aria-label="Select AI Art Style Preset"
            aria-expanded={showStyleMenu}
          >
            <ChevronDown size={13} className={`chevron-icon ${showStyleMenu ? "rotate" : ""}`} />
          </button>

          {showStyleMenu && (
            <div className="style-dropdown-menu" role="menu" aria-label="AI Style presets">
              <div className="style-dropdown-header">AI Art Style Preset</div>
              <div className="style-dropdown-list">
                {ENHANCE_STYLES.map((style) => {
                  const isSelected = selectedStyle.id === style.id;
                  return (
                    <button
                      key={style.id}
                      className={`style-dropdown-item ${isSelected ? "active" : ""}`}
                      onClick={() => {
                        setSelectedStyle(style);
                        setShowStyleMenu(false);
                      }}
                      role="menuitem"
                      aria-label={style.label}
                    >
                      <span className="style-icon">{STYLE_ICONS[style.id]}</span>
                      <div className="style-info">
                        <span className="style-name">{style.label}</span>
                        <span className="style-desc">{style.promptSuffix.split(",")[0]}</span>
                      </div>
                      {isSelected && <Check size={14} className="style-check-icon" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

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
          title="AI Prompt → Editable Diagram"
          aria-label="Generate editable diagram from text prompt"
          style={{ color: "#a5b4fc" }}
        >
          <Workflow size={16} />
        </button>
      </nav>

      {/* Single clean floating progress toast below the toolbar */}
      {isEnhancing && (
        <div
          style={{
            position: "fixed",
            top: "68px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(18, 18, 26, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(168, 85, 247, 0.4)",
            padding: "10px 16px",
            borderRadius: "14px",
            zIndex: 120,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            width: "300px",
            maxWidth: "calc(100vw - 32px)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(124, 58, 237, 0.2)",
            animation: "slideDownMenu 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={14} className="enhancing" style={{ color: "#d946ef" }} />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                AI Refining Sketch
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "#d8b4fe", fontWeight: 700 }}>
              {enhanceProgress > 0 ? `${enhanceProgress}%` : `~${timer}s`}
            </span>
          </div>

          <div style={{ width: "100%", height: "4px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "2px", overflow: "hidden" }}>
            <div
              style={{
                width: `${enhanceProgress > 0 ? enhanceProgress : ((30 - timer) / 30) * 100}%`,
                height: "100%",
                background: "#6366f1",
                borderRadius: "2px",
                transition: "width 0.4s ease"
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#9ca3af" }}>
            <span>Style: {selectedStyle.label}</span>
            <button
              onClick={() => setIsEnhancing(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#6b7280",
                fontSize: "10px",
                cursor: "pointer",
                padding: "0 2px"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Floating error notification below toolbar */}
      {enhanceError && (
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
          <span>{enhanceError}</span>
        </div>
      )}

      {/* Modern AI Image Generation & Enhancement Modal */}
      <AiImageModal
        isOpen={isAiImageModalOpen}
        onClose={() => setIsAiImageModalOpen(false)}
        initialPrompt={modalPrompt}
        sketchBase64={modalSketchBase64}
        onGenerate={handleImageGenerated}
      />
    </>
  );
}
