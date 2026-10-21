"use client";

import { useEffect } from "react";
import { X, Command } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";

type ShortcutsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
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

  const sections = [
    {
      title: "🎨 Tools",
      items: [
        { label: "Select", keys: ["V"] },
        { label: "Pan / Hand", keys: ["H"] },
        { label: "Pencil", keys: ["P"] },
        { label: "Rectangle", keys: ["R"] },
        { label: "Circle", keys: ["O"] },
        { label: "Line", keys: ["L"] },
        { label: "Arrow", keys: ["A"] },
        { label: "Text", keys: ["T"] },
        { label: "Sticky Note", keys: ["N"] },
        { label: "Image Tool", keys: ["I"] },
        { label: "Eraser", keys: ["E"] },
        { label: "Laser Pointer", keys: ["K"] }
      ]
    },
    {
      title: "📋 Clipboard & Edit",
      items: [
        { label: "Copy Selection", keys: ["Cmd/Ctrl", "C"] },
        { label: "Paste", keys: ["Cmd/Ctrl", "V"] },
        { label: "Duplicate", keys: ["Cmd/Ctrl", "D"] },
        { label: "Delete Element", keys: ["Del / Backspace"] },
        { label: "Clear Board", keys: ["X"] },
        { label: "Cancel / Deselect", keys: ["Esc"] }
      ]
    },
    {
      title: "📐 Layers & Z-Order",
      items: [
        { label: "Bring Forward", keys: ["]"] },
        { label: "Send Backward", keys: ["["] },
        { label: "Bring to Front", keys: ["Shift", "]"] },
        { label: "Send to Back", keys: ["Shift", "["] }
      ]
    },
    {
      title: "🔍 Navigation & View",
      items: [
        { label: "Zoom In", keys: ["+"] },
        { label: "Zoom Out", keys: ["-"] },
        { label: "Reset View", keys: ["Shift", "1"] },
        { label: "Undo", keys: ["Cmd/Ctrl", "Z"] },
        { label: "Redo", keys: ["Cmd/Ctrl", "Y"] },
        { label: "Toggle Shortcuts", keys: ["?"] }
      ]
    }
  ];

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
        aria-label="Keyboard Shortcuts"
        aria-modal="true"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "rgba(105, 101, 219, 0.2)", padding: "8px", borderRadius: "10px", color: "#6965db" }}>
              <Command size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: isLight ? "#0f172a" : "#ffffff" }}>
                Keyboard Shortcuts
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: isLight ? "#475569" : "#9ca3af" }}>
                Speed up your whiteboard workflow
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          {sections.map((sec) => (
            <div
              key={sec.title}
              style={{
                background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.03)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "none",
                borderRadius: "12px",
                padding: "14px"
              }}
            >
              <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: 700, color: isLight ? "#4f46e5" : "#93c5fd" }}>
                {sec.title}
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {sec.items.map((item) => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                    <span style={{ color: isLight ? "#1e293b" : "#d1d5db", fontWeight: 500 }}>{item.label}</span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          style={{
                            background: isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)",
                            border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.15)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            fontFamily: "monospace",
                            fontWeight: 600,
                            color: isLight ? "#0f172a" : "#f9fafb"
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
