"use client";

import { TOOL_OPTIONS } from "@/components/Canvas/tools";
import { exportSelectionToImage, getNormalizedBounds } from "@/components/Canvas/drawingUtils";
import { enhanceSketch } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";
import { useState } from "react";
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
  Image as ImageIcon
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

export function Toolbar() {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  
  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);
  const elements = useBoardStore((state) => state.elements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const isLocked = useBoardStore((state) => state.isLocked);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);

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

  return (
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

      <button 
        className={`tool-button ai-button ${isEnhancing ? "enhancing" : ""}`}
        onClick={handleEnhance}
        disabled={isEnhancing}
        title="Enhance with AI"
      >
        <Sparkles size={18} />
      </button>

      {enhanceError && (
        <div className="status-banner">
          {enhanceError}
        </div>
      )}
    </nav>
  );
}
