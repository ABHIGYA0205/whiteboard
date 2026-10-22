"use client";

import { useBoardStore } from "@/store/boardStore";
import { useEffect, useRef, useState, useCallback } from "react";
import { Map, Minimize2, Maximize2, LocateFixed } from "lucide-react";

export function Minimap() {
  const elements = useBoardStore((state) => state.elements);
  const viewport = useBoardStore((state) => state.viewport);
  const setViewport = useBoardStore((state) => state.setViewport);
  const theme = useBoardStore((state) => state.theme);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const MINIMAP_WIDTH = 200;
  const MINIMAP_HEIGHT = 130;

  // Calculates world bounding box that ALWAYS encompasses all elements AND current viewport
  const calculateBounds = useCallback(() => {
    const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
    const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800;

    // Viewport bounds in world coordinates
    const vpWorldX = -viewport.x / viewport.zoom;
    const vpWorldY = -viewport.y / viewport.zoom;
    const vpWorldW = windowWidth / viewport.zoom;
    const vpWorldH = windowHeight / viewport.zoom;

    let minX = vpWorldX;
    let minY = vpWorldY;
    let maxX = vpWorldX + vpWorldW;
    let maxY = vpWorldY + vpWorldH;

    for (const el of elements) {
      if (el.type === "pencil") {
        if (!el.points || el.points.length < 2) continue;
        for (const pt of el.points) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
      } else if (el.type === "text") {
        if (!el.text?.trim()) continue;
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + (el.width || 60));
        maxY = Math.max(maxY, el.y + (el.height || 24));
      } else {
        const w = Math.abs(el.width || 0);
        const h = Math.abs(el.height || 0);
        if (w < 3 && h < 3) continue;

        const x1 = Math.min(el.x, el.x + el.width);
        const x2 = Math.max(el.x, el.x + el.width);
        const y1 = Math.min(el.y, el.y + el.height);
        const y2 = Math.max(el.y, el.y + el.height);

        minX = Math.min(minX, x1);
        minY = Math.min(minY, y1);
        maxX = Math.max(maxX, x2);
        maxY = Math.max(maxY, y2);
      }
    }

    // Add breathing room
    const paddingX = Math.max((maxX - minX) * 0.1, 150);
    const paddingY = Math.max((maxY - minY) * 0.1, 150);
    minX -= paddingX;
    minY -= paddingY;
    maxX += paddingX;
    maxY += paddingY;

    const contentWidth = Math.max(maxX - minX, 100);
    const contentHeight = Math.max(maxY - minY, 100);

    const scale = Math.min(MINIMAP_WIDTH / contentWidth, MINIMAP_HEIGHT / contentHeight);
    const offsetX = (MINIMAP_WIDTH - contentWidth * scale) / 2;
    const offsetY = (MINIMAP_HEIGHT - contentHeight * scale) / 2;

    return {
      minX,
      minY,
      maxX,
      maxY,
      scale,
      offsetX,
      offsetY,
      vpWorldX,
      vpWorldY,
      vpWorldW,
      vpWorldH
    };
  }, [elements, viewport]);

  // Render Minimap
  useEffect(() => {
    if (isCollapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    const isDark = theme === "dark";
    // Background
    ctx.fillStyle = isDark ? "#0f111a" : "#f1f5f9";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Subtle grid dots in minimap
    ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)";
    const dotSpacing = 16;
    for (let x = 0; x < MINIMAP_WIDTH; x += dotSpacing) {
      for (let y = 0; y < MINIMAP_HEIGHT; y += dotSpacing) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const {
      minX,
      minY,
      scale,
      offsetX,
      offsetY,
      vpWorldX,
      vpWorldY,
      vpWorldW,
      vpWorldH
    } = calculateBounds();

    // Render scaled elements
    for (const el of elements) {
      ctx.save();

      if (el.type === "pencil") {
        if (!el.points || el.points.length < 2) {
          ctx.restore();
          continue;
        }
        ctx.strokeStyle = el.strokeColor || (isDark ? "#94a3b8" : "#475569");
        ctx.lineWidth = Math.max(1, (el.strokeWidth || 2) * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        el.points.forEach((pt, idx) => {
          const px = (pt.x - minX) * scale + offsetX;
          const py = (pt.y - minY) * scale + offsetY;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      } else if (el.type === "line" || el.type === "arrow") {
        if (!el.width && !el.height) {
          ctx.restore();
          continue;
        }
        const startX = (el.x - minX) * scale + offsetX;
        const startY = (el.y - minY) * scale + offsetY;
        const endX = (el.x + (el.width || 0) - minX) * scale + offsetX;
        const endY = (el.y + (el.height || 0) - minY) * scale + offsetY;

        ctx.strokeStyle = el.strokeColor || (isDark ? "#94a3b8" : "#475569");
        ctx.lineWidth = Math.max(1, (el.strokeWidth || 1) * scale);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      } else if (el.type === "text") {
        // Skip empty text elements
        if (!el.text?.trim()) {
          ctx.restore();
          continue;
        }
        const x1 = el.x;
        const y1 = el.y;
        const rx = (x1 - minX) * scale + offsetX;
        const ry = (y1 - minY) * scale + offsetY;
        const rw = Math.max((el.width || 40) * scale, 6);
        const rh = Math.max((el.fontSize || 16) * scale * 0.8, 3);

        ctx.fillStyle = el.strokeColor || (isDark ? "#94a3b8" : "#475569");
        ctx.globalAlpha = 0.6;
        ctx.fillRect(rx, ry, rw, rh);
      } else {
        const w = Math.abs(el.width || 0);
        const h = Math.abs(el.height || 0);
        if (w < 3 || h < 3) {
          ctx.restore();
          continue;
        }

        const x1 = Math.min(el.x, el.x + el.width);
        const y1 = Math.min(el.y, el.y + el.height);

        const rx = (x1 - minX) * scale + offsetX;
        const ry = (y1 - minY) * scale + offsetY;
        const rw = Math.max(w * scale, 2);
        const rh = Math.max(h * scale, 2);

        const strokeColor = el.strokeColor || (isDark ? "#94a3b8" : "#475569");
        const fillColor = el.fillColor && el.fillColor !== "transparent" ? el.fillColor : null;

        if (el.type === "sticky") {
          ctx.fillStyle = el.fillColor || "#fef08a";
          ctx.strokeStyle = "#ca8a04";
          ctx.lineWidth = 1;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (el.type === "circle") {
          ctx.beginPath();
          ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
          if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();
          }
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = Math.max(1, (el.strokeWidth || 1) * scale);
          ctx.stroke();
        } else if (el.type === "image") {
          ctx.fillStyle = isDark ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.15)";
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 1;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        } else {
          // Rectangle
          if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(rx, ry, rw, rh);
          }
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = Math.max(1, (el.strokeWidth || 1) * scale);
          ctx.strokeRect(rx, ry, rw, rh);
        }
      }

      ctx.restore();
    }

    // Render Viewport Box (where user currently is looking)
    const vpMiniX = (vpWorldX - minX) * scale + offsetX;
    const vpMiniY = (vpWorldY - minY) * scale + offsetY;
    const vpMiniW = Math.max(vpWorldW * scale, 4);
    const vpMiniH = Math.max(vpWorldH * scale, 4);

    // Glowing border and tinted viewport fill
    ctx.save();
    ctx.fillStyle = "rgba(99, 102, 241, 0.16)";
    ctx.fillRect(vpMiniX, vpMiniY, vpMiniW, vpMiniH);

    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpMiniX, vpMiniY, vpMiniW, vpMiniH);

    // Subtle corner indicators for the viewport
    const cornerSize = Math.min(6, vpMiniW / 3, vpMiniH / 3);
    ctx.fillStyle = "#818cf8";
    ctx.fillRect(vpMiniX - 1, vpMiniY - 1, cornerSize, 2);
    ctx.fillRect(vpMiniX - 1, vpMiniY - 1, 2, cornerSize);
    ctx.fillRect(vpMiniX + vpMiniW - cornerSize + 1, vpMiniY - 1, cornerSize, 2);
    ctx.fillRect(vpMiniX + vpMiniW - 1, vpMiniY - 1, 2, cornerSize);
    ctx.fillRect(vpMiniX - 1, vpMiniY + vpMiniH - 1, cornerSize, 2);
    ctx.fillRect(vpMiniX - 1, vpMiniY + vpMiniH - cornerSize + 1, 2, cornerSize);
    ctx.fillRect(vpMiniX + vpMiniW - cornerSize + 1, vpMiniY + vpMiniH - 1, cornerSize, 2);
    ctx.fillRect(vpMiniX + vpMiniW - 1, vpMiniY + vpMiniH - cornerSize + 1, 2, cornerSize);

    ctx.restore();
  }, [elements, viewport, theme, isCollapsed, calculateBounds]);

  // Navigate to point from minimap coordinates
  const panToMinimapPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      const { minX, minY, scale, offsetX, offsetY } = calculateBounds();

      const worldTargetX = (clickX - offsetX) / scale + minX;
      const worldTargetY = (clickY - offsetY) / scale + minY;

      const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800;

      setViewport({
        x: -(worldTargetX * viewport.zoom - windowWidth / 2),
        y: -(worldTargetY * viewport.zoom - windowHeight / 2),
        zoom: viewport.zoom
      });
    },
    [calculateBounds, setViewport, viewport.zoom]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    panToMinimapPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    panToMinimapPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
    setIsDragging(false);
  };

  const handleResetView = () => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  return (
    <div
      className="minimap-wrapper"
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px"
      }}
    >
      {/* Minimap Card */}
      <div
        style={{
          background: "rgba(18, 18, 24, 0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            background: "rgba(255, 255, 255, 0.03)",
            borderBottom: isCollapsed ? "none" : "1px solid rgba(255, 255, 255, 0.06)",
            fontSize: "11px",
            color: "#9ca3af",
            fontWeight: 600,
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Map size={13} style={{ color: "#818cf8" }} />
            <span style={{ letterSpacing: "0.04em", fontSize: "10px", textTransform: "uppercase" }}>
              Navigator
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {!isCollapsed && (
              <button
                onClick={handleResetView}
                title="Reset View to (0,0) at 100%"
                aria-label="Reset View"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  padding: "3px 4px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <LocateFixed size={12} />
              </button>
            )}

            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? "Expand Minimap" : "Collapse Minimap"}
              aria-label={isCollapsed ? "Expand Minimap" : "Collapse Minimap"}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                padding: "3px 4px",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center"
              }}
            >
              {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            </button>
          </div>
        </div>

        {/* Canvas area */}
        {!isCollapsed && (
          <div
            style={{
              position: "relative",
              cursor: isDragging ? "grabbing" : "grab",
              touchAction: "none"
            }}
          >
            <canvas
              ref={canvasRef}
              width={MINIMAP_WIDTH}
              height={MINIMAP_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ display: "block" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
