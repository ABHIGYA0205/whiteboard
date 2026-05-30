"use client";

import { TOOL_OPTIONS } from "@/components/Canvas/tools";
import { exportSelectionToImage, getNormalizedBounds } from "@/components/Canvas/drawingUtils";
import { enhanceSketch } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";
import { useState, useEffect, useRef } from "react";
import type { WhiteboardElement } from "@shared/types";
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
  Diamond,
  Image as ImageIcon,
  Trash2,
  ChevronDown,
  Palette,
  Flame,
  Zap,
  Box,
  Laptop,
  Paintbrush
} from "lucide-react";

const TOOL_ICONS: Record<string, React.ReactNode> = {
  select: <MousePointer2 size={18} />,
  pan: <Hand size={18} />,
  pencil: <Pencil size={18} />,
  rectangle: <Square size={18} />,
  circle: <Circle size={18} />,
  line: <Minus size={18} />,
  arrow: <MoveUpRight size={18} />,
  text: <Type size={18} />,
  eraser: <Eraser size={18} />,
  image: <ImageIcon size={18} />
};

const COLORS = [
  { name: "White", value: "#ececf1" },
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
    emitReplace: (elements: WhiteboardElement[]) => void;
    emitElementUpdate: (element: WhiteboardElement) => void;
  };
};

export function Toolbar({ collaboration }: ToolbarProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Style selector states
  const [selectedStyle, setSelectedStyle] = useState(ENHANCE_STYLES[0]);
  const [showStyleMenu, setShowStyleMenu] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close style menu when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStyleMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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
  const setStrokeColor = useBoardStore((state) => state.setStrokeColor);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);
  const elements = useBoardStore((state) => state.elements);
  const setElements = useBoardStore((state) => state.setElements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const selectElement = useBoardStore((state) => state.selectElement);
  const isLocked = useBoardStore((state) => state.isLocked);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);
  const clearBoard = useBoardStore((state) => state.clearBoard);

  const handleEnhance = async () => {
    // 1. Gather all drawing elements
    const drawingElements = elements.filter(
      (el) =>
        el.type === "pencil" ||
        el.type === "rectangle" ||
        el.type === "circle" ||
        el.type === "line" ||
        el.type === "arrow"
    );

    if (drawingElements.length === 0) {
      setEnhanceError("Draw something first!");
      setTimeout(() => setEnhanceError(null), 3000);
      return;
    }

    // 2. Identify the active seed element to start clustering.
    // If the user has selected a drawing element, start there.
    // Otherwise, start with the most recently drawn element.
    let seedElement = drawingElements[drawingElements.length - 1];
    if (selectedElementId) {
      const selected = drawingElements.find((el) => el.id === selectedElementId);
      if (selected) {
        seedElement = selected;
      }
    }

    // Helper to calculate bounding box bounds
    const getBoundingBox = (el: WhiteboardElement) => {
      const bounds = getNormalizedBounds(el);
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
          minX: bounds.x,
          minY: bounds.y,
          maxX: bounds.x + bounds.width,
          maxY: bounds.y + bounds.height
        };
      }
    };

    const getBoxCenter = (box: { minX: number; minY: number; maxX: number; maxY: number }) => {
      return {
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2
      };
    };

    // 3. Spatially cluster drawings using BFS (threshold of 400px)
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

    // 4. Find all text elements with content
    const textElements = elements.filter(
      (el) => el.type === "text" && el.text?.trim()
    );

    if (textElements.length === 0) {
      setEnhanceError("Add a text prompt next to your drawing!");
      setTimeout(() => setEnhanceError(null), 3500);
      return;
    }

    // 5. Calculate cluster bounding box
    let clusterMinX = Infinity, clusterMinY = Infinity, clusterMaxX = -Infinity, clusterMaxY = -Infinity;
    for (const el of cluster) {
      const box = getBoundingBox(el);
      clusterMinX = Math.min(clusterMinX, box.minX);
      clusterMinY = Math.min(clusterMinY, box.minY);
      clusterMaxX = Math.max(clusterMaxX, box.maxX);
      clusterMaxY = Math.max(clusterMaxY, box.maxY);
    }
    const clusterCenter = {
      x: (clusterMinX + clusterMaxX) / 2,
      y: (clusterMinY + clusterMaxY) / 2
    };

    // 6. Find the closest text element to the cluster center
    let closestTextElement: WhiteboardElement | null = null;
    let minDistance = Infinity;

    for (const textEl of textElements) {
      const textBox = getBoundingBox(textEl);
      const textCenter = getBoxCenter(textBox);
      const distance = Math.hypot(
        clusterCenter.x - textCenter.x,
        clusterCenter.y - textCenter.y
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestTextElement = textEl;
      }
    }

    if (!closestTextElement || !closestTextElement.text?.trim()) {
      setEnhanceError("Add a text prompt next to your drawing!");
      setTimeout(() => setEnhanceError(null), 3500);
      return;
    }

    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      const imageBase64 = exportSelectionToImage(cluster);
      if (!imageBase64) throw new Error("Capture failed.");

      // Combine user text prompt with the premium style suffix
      const userPrompt = closestTextElement.text.trim();
      const styledPrompt = `${userPrompt}, ${selectedStyle.promptSuffix}`;

      const result = await enhanceSketch(imageBase64, styledPrompt);

      const imageElement = {
        id: crypto.randomUUID(),
        type: "image" as const,
        x: clusterMinX,
        y: clusterMinY,
        width: Math.max(clusterMaxX - clusterMinX, 200),
        height: Math.max(clusterMaxY - clusterMinY, 200),
        strokeColor: "#ffffff",
        strokeWidth: 1,
        imageUrl: result.imageUrl,
        points: []
      };

      // Replace ONLY the sketch elements of the active cluster!
      const clusterIds = new Set(cluster.map((el) => el.id));
      const nextElements = elements.filter((el) => !clusterIds.has(el.id));
      nextElements.push(imageElement);

      commitElements(nextElements);
      collaboration?.emitReplace(nextElements);

      // Automatically switch active tool to SELECT and highlight the new image!
      setTool("select");
      selectElement(imageElement.id);
    } catch (error) {
      setEnhanceError(error instanceof Error ? error.message : "AI failed.");
      setTimeout(() => setEnhanceError(null), 5000);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleColorChange = (color: string) => {
    setStrokeColor(color);
    
    if (selectedElementId) {
      const nextElements = elements.map((el) => 
        el.id === selectedElementId ? { ...el, strokeColor: color } : el
      );
      setElements(nextElements);
      commitElements(nextElements);
      collaboration?.emitReplace(nextElements);
    }
  };

  return (
    <>
      <nav className="top-toolbar">
        <button 
          className={`tool-button ${isLocked ? "active" : ""}`} 
          title={isLocked ? "Unlock Canvas" : "Lock Canvas"}
          onClick={() => setIsLocked(!isLocked)}
        >
          <Lock size={16} />
        </button>
        
        <div className="menu-divider" style={{ width: '1px', height: '24px', margin: '0 4px', background: 'rgba(255,255,255,0.1)' }} />

        {TOOL_OPTIONS.map((option) => (
          <button
            className={`tool-button ${tool === option.id ? "active" : ""}`}
            key={option.id}
            onClick={() => setTool(option.id)}
            title={option.label}
          >
            {TOOL_ICONS[option.id]}
            <span className="tool-shortcut">{option.shortcut}</span>
          </button>
        ))}

        <div className="menu-divider" style={{ width: '1px', height: '24px', margin: '0 4px', background: 'rgba(255,255,255,0.1)' }} />

        <div className="color-picker-container">
          {COLORS.map((c) => (
            <button
              key={c.value}
              className={`color-swatch ${strokeColor === c.value ? "active" : ""}`}
              style={{ backgroundColor: c.value }}
              onClick={() => handleColorChange(c.value)}
              title={c.name}
            />
          ))}
          <div className="color-divider" />
          <input 
            type="color" 
            className="custom-color-input" 
            value={strokeColor.startsWith('#') ? strokeColor : '#ffffff'} 
            onChange={(e) => handleColorChange(e.target.value)}
            title="Custom Color"
          />
        </div>

        <div className="menu-divider" style={{ width: '1px', height: '24px', margin: '0 4px', background: 'rgba(255,255,255,0.1)' }} />

        {/* Premium AI Enhancer and Style Selector */}
        <div style={{ position: "relative", display: "flex", gap: "2px" }} ref={dropdownRef}>
          <button 
            className={`tool-button ai-button ${isEnhancing ? "enhancing" : ""}`}
            onClick={handleEnhance}
            disabled={isEnhancing}
            title={`Enhance sketch using ${selectedStyle.label}`}
            style={{ 
              borderTopRightRadius: 0, 
              borderBottomRightRadius: 0,
              paddingRight: '6px',
              paddingLeft: '8px'
            }}
          >
            <Sparkles size={16} style={{ marginRight: '4px' }} />
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {selectedStyle.label.split(" ")[0]}
            </span>
          </button>
          
          <button
            className="tool-button ai-button"
            disabled={isEnhancing}
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            title="Choose AI Style Preset"
            style={{ 
              width: '20px',
              borderTopLeftRadius: 0, 
              borderBottomLeftRadius: 0,
              borderLeft: '1px solid rgba(255,255,255,0.2)',
              padding: 0
            }}
          >
            <ChevronDown size={12} />
          </button>

          {showStyleMenu && (
            <div className="style-dropdown-menu">
              {ENHANCE_STYLES.map((style) => (
                <button
                  key={style.id}
                  className={`style-dropdown-item ${selectedStyle.id === style.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedStyle(style);
                    setShowStyleMenu(false);
                  }}
                >
                  <span className="style-icon">{STYLE_ICONS[style.id]}</span>
                  <span>{style.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="menu-divider" style={{ width: '1px', height: '24px', margin: '0 4px', background: 'rgba(255,255,255,0.1)' }} />

        <button 
          className="tool-button"
          onClick={() => {
            if (showClearConfirm) {
              clearBoard();
              setShowClearConfirm(false);
            } else {
              setShowClearConfirm(true);
              setTimeout(() => setShowClearConfirm(false), 3000);
            }
          }}
          title="Clear Canvas"
          style={{ width: showClearConfirm ? '60px' : '36px', transition: 'width 0.2s ease' }}
        >
          {showClearConfirm ? (
            <span style={{ fontSize: '10px', color: '#ff4444', fontWeight: 800 }}>SURE?</span>
          ) : (
            <Trash2 size={18} color="#ff4444" />
          )}
        </button>

        {isEnhancing && (
          <div className="status-banner" style={{ background: 'rgba(105, 101, 219, 0.9)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
            <Sparkles size={14} className="enhancing" style={{ marginRight: '8px' }} />
            AI is enhancing your sketch...
          </div>
        )}

        {enhanceError && (
          <div className="status-banner">
            {enhanceError}
          </div>
        )}
      </nav>

      {isEnhancing && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'rgba(23, 23, 23, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(105, 101, 219, 0.4)',
          padding: '16px 20px',
          borderRadius: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '240px',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Generating Image</span>
            <span style={{ fontSize: '12px', color: '#a5a6f6', fontWeight: 700 }}>~{timer}s</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${((30 - timer) / 30) * 100}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #6965db, #ff6b6b)',
              transition: 'width 1s linear'
            }} />
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: '#9ba1b0' }}>
            Our AI models are refining your sketch into a professional illustration ({selectedStyle.label}).
          </p>
        </div>
      )}
    </>
  );
}
