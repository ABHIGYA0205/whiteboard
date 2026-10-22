"use client";

import { useState, useEffect, useRef } from "react";
import { useBoardStore } from "@/store/boardStore";
import type { WhiteboardElement } from "@shared/types";
import {
  Copy,
  Trash2,
  ChevronsDown,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Square,
  Sparkles,
  Palette,
  Pipette,
  X
} from "lucide-react";

function getContrastColor(hexColor?: string): string {
  if (!hexColor || hexColor === "transparent") return "#ffffff";
  const hex = hexColor.replace("#", "");
  if (hex.length < 6) return "#ffffff";
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#0f172a" : "#ffffff";
}

type PropertiesPanelProps = {
  collaboration?: {
    emitReplace: (elements: WhiteboardElement[]) => void;
  };
};

export function PropertiesPanel({ collaboration }: PropertiesPanelProps) {
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";
  const elements = useBoardStore((state) => state.elements);
  const selectedElementIds = useBoardStore((state) => state.selectedElementIds);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);
  const tool = useBoardStore((state) => state.tool);

  // Store active properties
  const strokeColor = useBoardStore((state) => state.strokeColor);
  const setStrokeColor = useBoardStore((state) => state.setStrokeColor);
  const fillColor = useBoardStore((state) => state.fillColor);
  const setFillColor = useBoardStore((state) => state.setFillColor);
  const strokeWidth = useBoardStore((state) => state.strokeWidth);
  const setStrokeWidth = useBoardStore((state) => state.setStrokeWidth);
  const strokeStyle = useBoardStore((state) => state.strokeStyle);
  const setStrokeStyle = useBoardStore((state) => state.setStrokeStyle);
  const fillStyle = useBoardStore((state) => state.fillStyle);
  const setFillStyle = useBoardStore((state) => state.setFillStyle);
  const roughness = useBoardStore((state) => state.roughness);
  const setRoughness = useBoardStore((state) => state.setRoughness);
  const roundness = useBoardStore((state) => state.roundness);
  const setRoundness = useBoardStore((state) => state.setRoundness);
  const opacity = useBoardStore((state) => state.opacity);
  const setOpacity = useBoardStore((state) => state.setOpacity);

  // Layer & Action operations
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const bringForward = useBoardStore((state) => state.bringForward);
  const sendBackward = useBoardStore((state) => state.sendBackward);
  const sendToBack = useBoardStore((state) => state.sendToBack);
  const duplicateSelected = useBoardStore((state) => state.duplicateSelected);
  const deleteSelected = useBoardStore((state) => state.deleteSelected);

  // Only display selection properties when in select mode with selected elements
  const hasSelection = (selectedElementIds.length > 0 || Boolean(selectedElementId)) && tool === "select";
  const isDrawingTool = [
    "rectangle",
    "diamond",
    "circle",
    "line",
    "arrow",
    "pencil",
    "text",
    "sticky"
  ].includes(tool);

  const isPropertiesOpen = useBoardStore((state) => state.isPropertiesOpen);
  const setIsPropertiesOpen = useBoardStore((state) => state.setIsPropertiesOpen);

  if (!hasSelection && !isDrawingTool) {
    return null;
  }

  if (!isPropertiesOpen) {
    return null;
  }

  // Get active selected element if single selection
  const selectedElement = hasSelection
    ? elements.find((e) => e.id === selectedElementIds[0])
    : null;

  const currentStroke = selectedElement?.strokeColor ?? strokeColor;
  const currentFill = selectedElement?.fillColor ?? fillColor;
  const currentWidth = selectedElement?.strokeWidth ?? strokeWidth;
  const currentStyle = selectedElement?.strokeStyle ?? strokeStyle;
  const currentFillStyle = selectedElement?.fillStyle ?? fillStyle;
  const currentRoughness = selectedElement?.roughness ?? roughness;
  const currentRoundness = selectedElement?.roundness ?? roundness;
  const currentOpacity = selectedElement?.opacity ?? opacity;

  const showEdges =
    tool === "rectangle" ||
    tool === "diamond" ||
    selectedElement?.type === "rectangle" ||
    selectedElement?.type === "diamond";

  const showFill =
    tool !== "line" &&
    tool !== "arrow" &&
    selectedElement?.type !== "line" &&
    selectedElement?.type !== "arrow";

  const strokeSwatches = [
    { label: "Default", color: isLight ? "#1e293b" : "#ececf1" },
    { label: "Red", color: "#e03131" },
    { label: "Green", color: "#2f9e44" },
    { label: "Blue", color: "#1971c2" },
    { label: "Yellow", color: "#f08c00" },
    { label: "Charcoal", color: "#343a40" }
  ];

  const bgSwatches = [
    { label: "Transparent", color: "transparent" },
    { label: "Light Red", color: "#ffc9c9" },
    { label: "Light Green", color: "#b2f2bb" },
    { label: "Light Blue", color: "#a5d8ff" },
    { label: "Light Yellow", color: "#ffec99" },
    { label: "Light Purple", color: "#eebefa" }
  ];

  const handleAction = (fn: () => WhiteboardElement[] | null) => {
    const nextElements = fn();
    if (nextElements) {
      collaboration?.emitReplace(nextElements);
    }
  };

  const updateProperty = (action: () => void) => {
    action();
    if (hasSelection) {
      const nextElements = useBoardStore.getState().elements;
      collaboration?.emitReplace?.(nextElements);
    }
  };

  const panelBg = isLight ? "#ffffff" : "#12131f";
  const borderColor = isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";
  const textColor = isLight ? "#1e293b" : "#f1f5f9";
  const subTextColor = isLight ? "#64748b" : "#94a3b8";
  const buttonBg = isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.05)";
  const activeBtnBg = isLight ? "#e0e7ff" : "rgba(99, 102, 241, 0.25)";
  const activeBtnBorder = isLight ? "#6366f1" : "#818cf8";

  return (
    <>
      <div
        className="properties-mobile-backdrop"
        onClick={() => setIsPropertiesOpen(false)}
      />
      <aside
        className="excalidraw-properties-panel"
        aria-label="Element Properties"
        style={{
          background: panelBg,
          borderColor: borderColor,
          color: textColor
        }}
      >
        {/* Header with Title and Close button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "8px",
            borderBottom: `1px solid ${borderColor}`,
            marginBottom: "4px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: textColor }}>
            <Palette size={14} color="#818cf8" />
            <span>Properties & Style</span>
          </div>
          <button
            onClick={() => setIsPropertiesOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: subTextColor,
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center"
            }}
            title="Close Properties"
            aria-label="Close Properties"
          >
            <X size={15} />
          </button>
        </div>
      {/* 1. STROKE COLOR */}
      {(() => {
        const isCustomStroke = !strokeSwatches.some((s) => s.color.toLowerCase() === currentStroke.toLowerCase());
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: subTextColor }}>
                Stroke
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: subTextColor, fontFamily: "monospace" }}>
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    backgroundColor: currentStroke,
                    border: "1px solid rgba(255, 255, 255, 0.25)"
                  }}
                />
                <span>{currentStroke.toUpperCase()}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {strokeSwatches.map((s) => {
                const isActive = currentStroke.toLowerCase() === s.color.toLowerCase();
                return (
                  <button
                    key={s.color}
                    onClick={() => updateProperty(() => setStrokeColor(s.color))}
                    title={s.label}
                    aria-label={`Stroke color ${s.label}`}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      backgroundColor: s.color,
                      border: isActive ? `2px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                      boxShadow: isActive ? "0 0 0 2px rgba(99,102,241,0.35)" : "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "all 0.15s ease"
                    }}
                  />
                );
              })}
              {/* Custom color picker */}
              <label
                title={isCustomStroke ? `Selected custom stroke: ${currentStroke}` : "Choose custom stroke color"}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  border: isCustomStroke ? `2px solid ${activeBtnBorder}` : `1px dashed ${borderColor}`,
                  backgroundColor: isCustomStroke ? currentStroke : "transparent",
                  boxShadow: isCustomStroke ? "0 0 0 2px rgba(99,102,241,0.35)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.15s ease"
                }}
              >
                {isCustomStroke ? (
                  <Pipette size={11} color={getContrastColor(currentStroke)} />
                ) : (
                  <span style={{ fontSize: "11px", color: subTextColor }}>+</span>
                )}
                <input
                  type="color"
                  value={currentStroke.startsWith("#") ? currentStroke : "#1e293b"}
                  onChange={(e) => updateProperty(() => setStrokeColor(e.target.value))}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    cursor: "pointer",
                    width: "100%",
                    height: "100%"
                  }}
                />
              </label>
            </div>
          </div>
        );
      })()}

      {/* 2. FILL COLOR */}
      {showFill && (() => {
        const isCustomFill =
          currentFill !== "transparent" &&
          !bgSwatches.some((s) => s.color.toLowerCase() === currentFill.toLowerCase());
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: subTextColor }}>
                Fill Color
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: subTextColor, fontFamily: "monospace" }}>
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    backgroundColor: currentFill === "transparent" ? "#94a3b8" : currentFill,
                    border: "1px solid rgba(255, 255, 255, 0.25)"
                  }}
                />
                <span>{currentFill === "transparent" ? "NONE" : currentFill.toUpperCase()}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {bgSwatches.map((s) => {
                const isTrans = s.color === "transparent";
                const isActive =
                  currentFill.toLowerCase() === s.color.toLowerCase() ||
                  (isTrans && (!currentFill || currentFill === "transparent"));
                return (
                  <button
                    key={s.color}
                    onClick={() => updateProperty(() => setFillColor(s.color))}
                    title={s.label}
                    aria-label={`Fill color ${s.label}`}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      backgroundColor: isTrans ? "transparent" : s.color,
                      backgroundImage: isTrans
                        ? "linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)"
                        : "none",
                      backgroundSize: "8px 8px",
                      border: isActive ? `2px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                      boxShadow: isActive ? "0 0 0 2px rgba(99,102,241,0.35)" : "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "all 0.15s ease"
                    }}
                  />
                );
              })}
              {/* Custom fill color picker */}
              <label
                title={isCustomFill ? `Selected custom fill: ${currentFill}` : "Choose custom fill color"}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  border: isCustomFill ? `2px solid ${activeBtnBorder}` : `1px dashed ${borderColor}`,
                  backgroundColor: isCustomFill ? currentFill : "transparent",
                  boxShadow: isCustomFill ? "0 0 0 2px rgba(99,102,241,0.35)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.15s ease"
                }}
              >
                {isCustomFill ? (
                  <Pipette size={11} color={getContrastColor(currentFill)} />
                ) : (
                  <span style={{ fontSize: "11px", color: subTextColor }}>+</span>
                )}
                <input
                  type="color"
                  value={currentFill.startsWith("#") ? currentFill : "#ffffff"}
                  onChange={(e) => updateProperty(() => setFillColor(e.target.value))}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    cursor: "pointer",
                    width: "100%",
                    height: "100%"
                  }}
                />
              </label>
            </div>
          </div>
        );
      })()}

      {/* 3. FILL STYLE */}
      {showFill && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
            Fill
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "transparent", label: "Empty", icon: "∅" },
              { id: "semi", label: "Hachure / Semi", icon: "▧" },
              { id: "solid", label: "Solid", icon: "■" }
            ].map((f) => {
              const isActive = (currentFillStyle || "transparent") === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => updateProperty(() => setFillStyle(f.id as any))}
                  title={f.label}
                  aria-label={`Fill style ${f.label}`}
                  style={{
                    flex: 1,
                    height: "28px",
                    borderRadius: "6px",
                    background: isActive ? activeBtnBg : buttonBg,
                    border: isActive ? `1px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                    color: isActive ? (isLight ? "#4f46e5" : "#a5b4fc") : textColor,
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {f.icon}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. STROKE WIDTH */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
          Stroke width
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { width: 1, label: "Thin", h: "1.5px" },
            { width: 2, label: "Medium", h: "3px" },
            { width: 4, label: "Thick", h: "5px" }
          ].map((w) => {
            const isActive = currentWidth === w.width;
            return (
              <button
                key={w.width}
                onClick={() => updateProperty(() => setStrokeWidth(w.width))}
                title={w.label}
                aria-label={`Stroke width ${w.label}`}
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: isActive ? activeBtnBg : buttonBg,
                  border: isActive ? `1px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: w.h,
                    borderRadius: "2px",
                    backgroundColor: isActive ? (isLight ? "#4f46e5" : "#a5b4fc") : textColor
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. STROKE STYLE */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
          Stroke style
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { id: "solid", label: "Solid", symbol: "—" },
            { id: "dashed", label: "Dashed", symbol: "---" },
            { id: "dotted", label: "Dotted", symbol: "···" }
          ].map((s) => {
            const isActive = (currentStyle || "solid") === s.id;
            return (
              <button
                key={s.id}
                onClick={() => updateProperty(() => setStrokeStyle(s.id as any))}
                title={s.label}
                aria-label={`Stroke style ${s.label}`}
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: isActive ? activeBtnBg : buttonBg,
                  border: isActive ? `1px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                  color: isActive ? (isLight ? "#4f46e5" : "#a5b4fc") : textColor,
                  fontSize: s.id === "dotted" ? "14px" : "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  letterSpacing: s.id === "dotted" ? "1px" : "normal"
                }}
              >
                {s.symbol}
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. SLOPPINESS / ROUGHNESS */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
          Sloppiness
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { level: 0, label: "Architect", icon: "—" },
            { level: 1, label: "Artist", icon: "∿" },
            { level: 2, label: "Cartoonist", icon: "〰" }
          ].map((r) => {
            const isActive = (currentRoughness ?? 0) === r.level;
            return (
              <button
                key={r.level}
                onClick={() => updateProperty(() => setRoughness(r.level))}
                title={r.label}
                aria-label={`Sloppiness ${r.label}`}
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: isActive ? activeBtnBg : buttonBg,
                  border: isActive ? `1px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                  color: isActive ? (isLight ? "#4f46e5" : "#a5b4fc") : textColor,
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {r.icon}
              </button>
            );
          })}
        </div>
      </div>

      {/* 7. EDGES / ROUNDNESS */}
      {showEdges && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
            Edges
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { val: false, label: "Sharp corners", icon: "⬚" },
              { val: true, label: "Round corners", icon: "▢" }
            ].map((e) => {
              const isActive = Boolean(currentRoundness) === e.val;
              return (
                <button
                  key={String(e.val)}
                  onClick={() => updateProperty(() => setRoundness(e.val))}
                  title={e.label}
                  aria-label={e.label}
                  style={{
                    flex: 1,
                    height: "28px",
                    borderRadius: "6px",
                    background: isActive ? activeBtnBg : buttonBg,
                    border: isActive ? `1px solid ${activeBtnBorder}` : `1px solid ${borderColor}`,
                    color: isActive ? (isLight ? "#4f46e5" : "#a5b4fc") : textColor,
                    fontSize: "15px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {e.icon}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. OPACITY */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: subTextColor }}>Opacity</span>
          <span style={{ fontSize: "11px", color: subTextColor, fontWeight: 600 }}>
            {Math.round((currentOpacity ?? 1) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round((currentOpacity ?? 1) * 100)}
          onChange={(e) => updateProperty(() => setOpacity(Number(e.target.value) / 100))}
          aria-label="Adjust opacity"
          style={{
            width: "100%",
            accentColor: "#6366f1",
            cursor: "pointer"
          }}
        />
      </div>

      {/* 9. LAYERS & ACTIONS (When selection is active) */}
      {hasSelection && (
        <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
              Layers
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => handleAction(sendToBack)}
                title="Send to back (Ctrl+[ / Cmd+[)"
                aria-label="Send to back"
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: buttonBg,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronsDown size={14} />
              </button>
              <button
                onClick={() => handleAction(sendBackward)}
                title="Send backward"
                aria-label="Send backward"
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: buttonBg,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={() => handleAction(bringForward)}
                title="Bring forward"
                aria-label="Bring forward"
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: buttonBg,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => handleAction(bringToFront)}
                title="Bring to front (Ctrl+] / Cmd+])"
                aria-label="Bring to front"
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: buttonBg,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronsUp size={14} />
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: subTextColor, marginBottom: "6px" }}>
              Actions
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => handleAction(duplicateSelected)}
                title="Duplicate (Ctrl+D)"
                aria-label="Duplicate element"
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: buttonBg,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600
                }}
              >
                <Copy size={13} />
                <span>Copy</span>
              </button>
              <button
                onClick={() => handleAction(deleteSelected)}
                title="Delete (Backspace/Delete)"
                aria-label="Delete element"
                style={{
                  flex: 1,
                  height: "28px",
                  borderRadius: "6px",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  color: "#ef4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600
                }}
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  </>
);
}
