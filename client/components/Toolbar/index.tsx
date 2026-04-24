"use client";

import { TOOL_OPTIONS } from "@/components/Canvas/tools";
import { exportSelectionToImage, getNormalizedBounds } from "@/components/Canvas/drawingUtils";
import { enhanceSketch } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";
import { useState, useEffect } from "react";
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
  Trash2
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

export function Toolbar() {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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
  const isLocked = useBoardStore((state) => state.isLocked);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);
  const clearBoard = useBoardStore((state) => state.clearBoard);

  const handleEnhance = async () => {
    // Gather all pencil/shape elements (the sketch)
    const drawingElements = elements.filter(
      (el) =>
        el.type === "pencil" ||
        el.type === "rectangle" ||
        el.type === "circle" ||
        el.type === "line" ||
        el.type === "arrow"
    );

    // Find a text element to use as the prompt
    const textElement = elements.find(
      (el) => el.type === "text" && el.text?.trim()
    );

    if (drawingElements.length === 0) {
      setEnhanceError("Draw something first!");
      setTimeout(() => setEnhanceError(null), 3000);
      return;
    }

    if (!textElement || !textElement.text?.trim()) {
      setEnhanceError("Add a text prompt!");
      setTimeout(() => setEnhanceError(null), 3000);
      return;
    }

    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      const imageBase64 = exportSelectionToImage(drawingElements);
      if (!imageBase64) throw new Error("Capture failed.");

      const result = await enhanceSketch(imageBase64, textElement.text.trim());

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of drawingElements) {
        const bounds = getNormalizedBounds(el);
        if (el.type === "pencil") {
          for (const pt of el.points) {
            minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
          }
        } else {
          minX = Math.min(minX, bounds.x); minY = Math.min(minY, bounds.y);
          maxX = Math.max(maxX, bounds.x + bounds.width); maxY = Math.max(maxY, bounds.y + bounds.height);
        }
      }

      const imageElement = {
        id: crypto.randomUUID(),
        type: "image" as const,
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 200),
        height: Math.max(maxY - minY, 200),
        strokeColor: "#ffffff",
        strokeWidth: 1,
        imageUrl: result.imageUrl,
        points: []
      };

      const drawingIds = new Set(drawingElements.map((el) => el.id));
      const nextElements = elements.filter((el) => !drawingIds.has(el.id));
      nextElements.push(imageElement);

      commitElements(nextElements);
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

        <button 
          className={`tool-button ai-button ${isEnhancing ? "enhancing" : ""}`}
          onClick={handleEnhance}
          disabled={isEnhancing}
          title="Enhance with AI"
        >
          <Sparkles size={18} />
        </button>

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
            Our AI models are refining your sketch into a professional illustration.
          </p>
        </div>
      )}
    </>
  );
}
