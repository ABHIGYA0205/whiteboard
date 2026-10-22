"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Workflow,
  ArrowRight,
  Loader2,
  Check,
  Cpu,
  Layers,
  GitBranch,
  Network
} from "lucide-react";
import { generateDiagramFromPrompt } from "@/lib/diagramGenerator";
import { useBoardStore } from "@/store/boardStore";
import type { WhiteboardElement } from "@shared/types";

type AiDiagramModalProps = {
  isOpen: boolean;
  onClose: () => void;
  collaboration?: {
    emitReplace: (elements: WhiteboardElement[]) => void;
  };
};

const DIAGRAM_TYPES = [
  {
    id: "system",
    label: "System Flow",
    desc: "Architecture & services",
    icon: Network,
    accent: "#6366f1"
  },
  {
    id: "flowchart",
    label: "Process Flow",
    desc: "Steps & decisions",
    icon: GitBranch,
    accent: "#8b5cf6"
  },
  {
    id: "pipeline",
    label: "Data Pipeline",
    desc: "Sequential stages",
    icon: Layers,
    accent: "#a855f7"
  },
  {
    id: "microservice",
    label: "Microservices",
    desc: "APIs & distributed nodes",
    icon: Cpu,
    accent: "#ec4899"
  }
];

const SUGGESTIONS = [
  "OAuth 2.0 Authentication Flow",
  "Microservices Architecture with API Gateway",
  "E-Commerce Order Checkout Pipeline",
  "CI / CD Deployment Pipeline",
  "User Onboarding & Verification Funnel",
  "Real-Time Chat Event Architecture"
];

export function AiDiagramModal({ isOpen, onClose, collaboration }: AiDiagramModalProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedType, setSelectedType] = useState(DIAGRAM_TYPES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const elements = useBoardStore((state) => state.elements);
  const commitElements = useBoardStore((state) => state.commitElements);
  const viewport = useBoardStore((state) => state.viewport);
  const setTool = useBoardStore((state) => state.setTool);
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  const handleGenerate = (targetPrompt?: string) => {
    const textToUse = targetPrompt || prompt;
    if (!textToUse.trim() || isGenerating) return;

    setIsGenerating(true);

    setTimeout(() => {
      const originX = -viewport.x / viewport.zoom + 120;
      const originY = -viewport.y / viewport.zoom + 140;

      const newElements = generateDiagramFromPrompt(textToUse, originX, originY);
      const nextElements = [...elements, ...newElements];

      commitElements(nextElements);
      collaboration?.emitReplace(nextElements);
      setTool("select");
      setIsGenerating(false);
      onClose();
    }, 450);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1050,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
      onClick={() => !isGenerating && onClose()}
    >
      <div
        style={{
          position: "relative",
          background: isLight ? "#ffffff" : "#18181b",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "600px",
          padding: "32px",
          boxShadow: isLight
            ? "0 25px 60px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)"
            : "0 30px 80px rgba(0, 0, 0, 0.8)",
          color: isLight ? "#0f172a" : "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          overflow: "hidden",
          transition: "all 0.2s ease"
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="AI Diagram Architect"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#6366f1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff"
              }}
            >
              <Workflow size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    fontWeight: 800,
                    color: isLight ? "#0f172a" : "#ffffff",
                    letterSpacing: "-0.02em"
                  }}
                >
                  Prompt → Native Diagram
                </h3>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: isLight ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.25)",
                    color: isLight ? "#4f46e5" : "#818cf8",
                    border: "1px solid rgba(99, 102, 241, 0.3)"
                  }}
                >
                  Vector Graph
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: isLight ? "#64748b" : "#94a3b8" }}>
                Generate editable boxes, labels, and arrows directly onto your whiteboard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close modal"
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.06)",
              border: "none",
              color: isLight ? "#475569" : "#9ca3af",
              borderRadius: "10px",
              padding: "8px",
              cursor: isGenerating ? "not-allowed" : "pointer",
              transition: "all 0.15s ease"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Input Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", position: "relative" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: isLight ? "#1e293b" : "#e2e8f0",
                  letterSpacing: "-0.01em"
                }}
              >
                Describe Your Process or Flow
              </label>
              <span style={{ fontSize: "11px", color: isLight ? "#94a3b8" : "#64748b" }}>
                {prompt.length}/300
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              maxLength={300}
              rows={3}
              aria-label="Process flow description"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.05)",
                border: isLight ? "1.5px solid #cbd5e1" : "1.5px solid rgba(255, 255, 255, 0.14)",
                color: isLight ? "#0f172a" : "#ffffff",
                fontSize: "14px",
                fontWeight: 500,
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
                transition: "all 0.2s ease"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#6366f1";
                e.target.style.boxShadow = "0 0 0 4px rgba(99, 102, 241, 0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = isLight ? "#cbd5e1" : "rgba(255, 255, 255, 0.14)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Flow Category Selector */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: isLight ? "#64748b" : "#94a3b8",
                marginBottom: "10px"
              }}
            >
              Diagram Architecture
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "8px"
              }}
            >
              {DIAGRAM_TYPES.map((type) => {
                const isSelected = selectedType.id === type.id;
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.id}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setSelectedType(type)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      border: isSelected
                        ? `2px solid ${type.accent}`
                        : isLight
                        ? "1px solid rgba(0, 0, 0, 0.08)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      background: isSelected
                        ? isLight
                          ? `${type.accent}15`
                          : `${type.accent}25`
                        : isLight
                        ? "#f8fafc"
                        : "rgba(255, 255, 255, 0.03)",
                      color: isSelected ? (isLight ? "#0f172a" : "#ffffff") : isLight ? "#475569" : "#94a3b8",
                      fontSize: "12px",
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      boxShadow: isSelected ? `0 4px 14px ${type.accent}35` : "none",
                      transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                  >
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "6px",
                        background: isSelected ? type.accent : isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                        color: isSelected ? "#ffffff" : type.accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      <IconComponent size={13} />
                    </div>
                    <span style={{ whiteSpace: "nowrap" }}>{type.label}</span>
                    {isSelected && <Check size={13} style={{ marginLeft: "auto", color: type.accent }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Example Suggestions */}
          <div>
            <span
              style={{
                fontSize: "11px",
                color: isLight ? "#64748b" : "#94a3b8",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                marginBottom: "8px"
              }}
            >
              Quick Inspiration
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {SUGGESTIONS.slice(0, 4).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    setPrompt(sug);
                    handleGenerate(sug);
                  }}
                  style={{
                    background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.04)",
                    border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    color: isLight ? "#334155" : "#cbd5e1",
                    fontSize: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#6366f1";
                    e.currentTarget.style.color = isLight ? "#0f172a" : "#ffffff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
                    e.currentTarget.style.color = isLight ? "#334155" : "#cbd5e1";
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={!prompt.trim() || isGenerating}
            style={{
              padding: "14px 24px",
              borderRadius: "14px",
              background:
                isGenerating || !prompt.trim()
                  ? isLight
                    ? "#e2e8f0"
                    : "rgba(255, 255, 255, 0.08)"
                  : "#6366f1",
              color:
                isGenerating || !prompt.trim()
                  ? isLight
                    ? "#94a3b8"
                    : "#64748b"
                  : "#ffffff",
              border: "none",
              fontWeight: 700,
              fontSize: "15px",
              cursor: isGenerating || !prompt.trim() ? "not-allowed" : "pointer",
              boxShadow: isGenerating || !prompt.trim() ? "none" : "0 4px 14px rgba(99, 102, 241, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              marginTop: "4px"
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Synthesizing Native Diagram Shapes...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>Generate Editable Diagram</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
