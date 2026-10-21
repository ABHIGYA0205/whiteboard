"use client";

import { useEffect } from "react";
import { X, LayoutTemplate, Plus } from "lucide-react";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/templates";
import { useBoardStore } from "@/store/boardStore";
import type { WhiteboardElement } from "@shared/types";

type TemplatesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  collaboration?: {
    emitReplace: (elements: WhiteboardElement[]) => void;
  };
};

export function TemplatesModal({ isOpen, onClose, collaboration }: TemplatesModalProps) {
  const elements = useBoardStore((state) => state.elements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const viewport = useBoardStore((state) => state.viewport);
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectTemplate = (template: BoardTemplate) => {
    const originX = -viewport.x / viewport.zoom + 120;
    const originY = -viewport.y / viewport.zoom + 100;

    const templateElements = template.generate(originX, originY);
    const nextElements = [...elements, ...templateElements];

    commitElements(nextElements);
    collaboration?.emitReplace(nextElements);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isLight ? "#ffffff" : "#181824",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "24px",
          boxShadow: isLight ? "0 20px 50px rgba(0, 0, 0, 0.12)" : "0 20px 50px rgba(0, 0, 0, 0.6)",
          color: isLight ? "#0f172a" : "#f3f4f6"
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Templates Gallery"
        aria-modal="true"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "rgba(105, 101, 219, 0.2)", padding: "8px", borderRadius: "10px", color: "#6965db" }}>
              <LayoutTemplate size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: isLight ? "#0f172a" : "#ffffff" }}>
                Templates Gallery
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: isLight ? "#475569" : "#9ca3af" }}>
                Jumpstart your ideas with ready-to-use whiteboard templates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
              border: "none",
              color: isLight ? "#475569" : "#9ca3af",
              borderRadius: "8px",
              padding: "6px",
              cursor: "pointer"
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {BOARD_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.03)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
                transition: "border-color 0.2s"
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontWeight: 700,
                      color: isLight ? "#4338ca" : "#818cf8",
                      background: isLight ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.15)",
                      padding: "2px 6px",
                      borderRadius: "4px"
                    }}
                  >
                    {tmpl.category}
                  </span>
                </div>
                <h4 style={{ margin: "4px 0", fontSize: "15px", fontWeight: 600, color: isLight ? "#0f172a" : "#ffffff" }}>
                  {tmpl.title}
                </h4>
                <p style={{ margin: 0, fontSize: "12px", color: isLight ? "#475569" : "#9ca3af", lineHeight: 1.4 }}>
                  {tmpl.description}
                </p>
              </div>

              <button
                onClick={() => handleSelectTemplate(tmpl)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: isLight ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.2)",
                  border: isLight ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(99, 102, 241, 0.4)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: isLight ? "#4f46e5" : "#a5b4fc",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  transition: "all 0.2s"
                }}
              >
                <Plus size={14} />
                <span>Insert Template</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
