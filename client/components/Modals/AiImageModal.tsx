"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Wand2,
  Loader2,
  Check,
  Palette,
  Camera,
  Box,
  Flame,
  Zap,
  Feather,
  Layers,
  ArrowRight,
  Sliders,
  Image as ImageIcon
} from "lucide-react";
import { generateAiImage, type GenerateAiImageResult } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";
import { exportSelectionToImage } from "@/components/Canvas/drawingUtils";

type AiImageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  sketchBase64?: string;
  onGenerate: (imageUrl: string, width: number, height: number) => void;
};

export const AI_IMAGE_STYLES = [
  {
    id: "digital",
    label: "Digital Art",
    color: "#8b5cf6",
    icon: Palette
  },
  {
    id: "photo",
    label: "Photorealistic",
    color: "#3b82f6",
    icon: Camera
  },
  {
    id: "3d",
    label: "3D Render",
    color: "#06b6d4",
    icon: Box
  },
  {
    id: "anime",
    label: "Anime / Manga",
    color: "#ec4899",
    icon: Zap
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    color: "#f43f5e",
    icon: Flame
  },
  {
    id: "watercolor",
    label: "Watercolor",
    color: "#10b981",
    icon: Feather
  },
  {
    id: "vector",
    label: "Vector / Icon",
    color: "#f59e0b",
    icon: Layers
  }
];

const EXAMPLE_PROMPTS = [
  "Futuristic electric supercar with glowing wheels",
  "Cyberpunk neon street cafe at midnight in rain",
  "Cute fluffy golden retriever puppy with sunglasses",
  "Cozy mountain cabin during glowing orange sunset",
  "Minimalist modern tech logo for cloud platform"
];

const FOLLOW_SKETCH_STEPS = [
  { label: "Loosely", value: 0.2, description: "More creative freedom" },
  { label: "Balanced", value: 0.5, description: "Balances sketch & style" },
  { label: "Closely", value: 0.9, description: "Strictly adheres to lines" }
];

export function AiImageModal({
  isOpen,
  onClose,
  initialPrompt = "",
  sketchBase64: passedSketchBase64,
  onGenerate
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(AI_IMAGE_STYLES[0]);
  const [literal, setLiteral] = useState<number>(0.5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeSketch, setActiveSketch] = useState<string | undefined>(undefined);
  const [generatedResult, setGeneratedResult] = useState<GenerateAiImageResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const theme = useBoardStore((state) => state.theme);
  const elements = useBoardStore((state) => state.elements);
  const selectedElementIds = useBoardStore((state) => state.selectedElementIds);
  const selectedElementId = useBoardStore((state) => state.selectedElementId);

  const isLight = theme === "light";

  // Compute active sketch on open
  useEffect(() => {
    if (isOpen) {
      setPrompt(initialPrompt || "");
      setError(null);
      setProgress(0);
      setIsGenerating(false);
      setGeneratedResult(null);

      if (passedSketchBase64) {
        setActiveSketch(passedSketchBase64);
      } else {
        // Fallback sketch capture from canvas
        const activeIds = selectedElementIds.length > 0
          ? selectedElementIds
          : (selectedElementId ? [selectedElementId] : []);

        if (activeIds.length > 0) {
          const selected = elements.filter((el) => activeIds.includes(el.id));
          if (selected.length > 0) {
            setActiveSketch(exportSelectionToImage(selected) || undefined);
          } else {
            setActiveSketch(undefined);
          }
        } else if (elements.length > 0) {
          setActiveSketch(exportSelectionToImage(elements) || undefined);
        } else {
          setActiveSketch(undefined);
        }
      }

      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, initialPrompt, passedSketchBase64, elements, selectedElementIds, selectedElementId]);

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

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("Please describe what image you want to create.");
      return;
    }

    setIsGenerating(true);
    setProgress(15);
    setError(null);
    setGeneratedResult(null);

    try {
      const res = await generateAiImage(
        {
          imageBase64: activeSketch,
          prompt: cleanPrompt,
          styleId: selectedStyle.id,
          literal,
          allowTextOnly: !activeSketch
        },
        (p) => setProgress(Math.max(15, p))
      );

      setProgress(100);
      setGeneratedResult(res);
    } catch (err: any) {
      setError(err?.message || "Image service unavailable, try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = () => {
    if (generatedResult?.imageUrl) {
      onGenerate(generatedResult.imageUrl, 400, 400);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: isLight ? "rgba(15, 23, 42, 0.45)" : "rgba(0, 0, 0, 0.75)",
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
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "28px",
          boxShadow: isLight
            ? "0 25px 60px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)"
            : "0 30px 80px rgba(0, 0, 0, 0.8)",
          color: isLight ? "#0f172a" : "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          transition: "all 0.2s ease"
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="AI Image Studio"
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
              <Wand2 size={22} />
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
                  AI Image Studio
                </h3>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: activeSketch
                      ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.25)"
                      : isLight ? "rgba(139, 92, 246, 0.12)" : "rgba(139, 92, 246, 0.25)",
                    color: activeSketch ? (isLight ? "#059669" : "#34d399") : (isLight ? "#7c3aed" : "#c084fc"),
                    border: activeSketch
                      ? "1px solid rgba(16, 185, 129, 0.3)"
                      : "1px solid rgba(139, 92, 246, 0.3)"
                  }}
                >
                  {activeSketch ? "Sketch Conditioned" : "Text to Image"}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: isLight ? "#64748b" : "#94a3b8" }}>
                Condition artwork directly on your drawing or generate from text
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

        {/* Result Preview Screen if generated */}
        {generatedResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
            <div
              style={{
                width: "100%",
                borderRadius: "14px",
                overflow: "hidden",
                border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.14)",
                background: isLight ? "#f8fafc" : "#09090b",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                maxHeight: "360px"
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedResult.imageUrl}
                alt={prompt}
                style={{
                  maxWidth: "100%",
                  maxHeight: "360px",
                  objectFit: "contain",
                  display: "block"
                }}
              />
            </div>

            {/* Provenance Caption */}
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: isLight ? "#64748b" : "#94a3b8",
                textAlign: "center",
                padding: "6px 12px",
                borderRadius: "8px",
                background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.05)"
              }}
            >
              AI · {generatedResult.model ? `${generatedResult.model} via ` : ""}
              {generatedResult.provider || "AI"} ·{" "}
              {generatedResult.sketchGuided
                ? "guided by your sketch"
                : "text only (your sketch was not used)"}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", width: "100%", gap: "10px", marginTop: "6px" }}>
              <button
                type="button"
                onClick={() => setGeneratedResult(null)}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.08)",
                  color: isLight ? "#334155" : "#e2e8f0",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Back / Edit
              </button>
              <button
                type="button"
                onClick={handleInsert}
                style={{
                  flex: 2,
                  padding: "12px 20px",
                  borderRadius: "12px",
                  background: "#6366f1",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)"
                }}
              >
                <Check size={16} />
                <span>Add to Canvas</span>
              </button>
            </div>
          </div>
        ) : (
          /* Input Form */
          <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Sketch Preview Badge or Subtle Notice */}
            {activeSketch ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: isLight ? "#f0fdf4" : "rgba(16, 185, 129, 0.1)",
                  border: isLight ? "1px solid #bbf7d0" : "1px solid rgba(16, 185, 129, 0.25)"
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeSketch}
                  alt="Sketch"
                  style={{
                    width: "40px",
                    height: "40px",
                    objectFit: "contain",
                    borderRadius: "6px",
                    background: "#ffffff",
                    border: "1px solid rgba(0,0,0,0.1)"
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: isLight ? "#166534" : "#4ade80" }}>
                    Conditioning on your drawing
                  </div>
                  <div style={{ fontSize: "11px", color: isLight ? "#15803d" : "#86efac" }}>
                    The output pose, structure, and shapes will follow your sketch.
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: "12px",
                  color: isLight ? "#94a3b8" : "#71717a",
                  fontStyle: "italic",
                  padding: "4px 2px"
                }}
              >
                No sketch — text only
              </div>
            )}

            {/* Prompt Input */}
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
                  Describe Your Image
                </label>
                <span style={{ fontSize: "11px", color: isLight ? "#94a3b8" : "#64748b" }}>
                  {prompt.length}/200
                </span>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isGenerating}
                maxLength={200}
                placeholder="e.g. A cybernetic warrior standing in the rain"
                aria-label="Image prompt description"
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  borderRadius: "14px",
                  background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.05)",
                  border: isLight ? "1.5px solid #cbd5e1" : "1.5px solid rgba(255, 255, 255, 0.14)",
                  color: isLight ? "#0f172a" : "#ffffff",
                  fontSize: "14px",
                  fontWeight: 500,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "all 0.2s ease"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#8b5cf6";
                  e.target.style.boxShadow = "0 0 0 4px rgba(139, 92, 246, 0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = isLight ? "#cbd5e1" : "rgba(255, 255, 255, 0.14)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Follow My Sketch Control (only when sketch is present) */}
            {activeSketch && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <Sliders size={13} style={{ color: "#8b5cf6" }} />
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: isLight ? "#1e293b" : "#e2e8f0"
                    }}
                  >
                    How much should it follow your drawing?
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  {FOLLOW_SKETCH_STEPS.map((step) => {
                    const isSelected = literal === step.value;
                    return (
                      <button
                        key={step.label}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setLiteral(step.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "10px",
                          border: isSelected
                            ? "2px solid #6366f1"
                            : isLight
                            ? "1px solid rgba(0, 0, 0, 0.08)"
                            : "1px solid rgba(255, 255, 255, 0.08)",
                          background: isSelected
                            ? isLight
                              ? "rgba(99, 102, 241, 0.1)"
                              : "rgba(99, 102, 241, 0.2)"
                            : isLight
                            ? "#f8fafc"
                            : "rgba(255, 255, 255, 0.03)",
                          color: isSelected ? (isLight ? "#4338ca" : "#a5b4fc") : isLight ? "#475569" : "#94a3b8",
                          cursor: "pointer",
                          textAlign: "center",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: isSelected ? 700 : 600 }}>{step.label}</div>
                        <div style={{ fontSize: "10px", opacity: 0.8, marginTop: "2px" }}>{step.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Inspirations */}
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
                {EXAMPLE_PROMPTS.slice(0, 3).map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setPrompt(item)}
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
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Style Cards */}
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
                Choose Art Style
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "8px"
                }}
              >
                {AI_IMAGE_STYLES.map((style) => {
                  const isSelected = selectedStyle.id === style.id;
                  const IconComponent = style.icon;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setSelectedStyle(style)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: isSelected
                          ? `2px solid ${style.color}`
                          : isLight
                          ? "1px solid rgba(0, 0, 0, 0.08)"
                          : "1px solid rgba(255, 255, 255, 0.08)",
                        background: isSelected
                          ? isLight
                            ? `${style.color}15`
                            : `${style.color}25`
                          : isLight
                          ? "#f8fafc"
                          : "rgba(255, 255, 255, 0.03)",
                        color: isSelected ? (isLight ? "#0f172a" : "#ffffff") : isLight ? "#475569" : "#94a3b8",
                        fontSize: "12px",
                        fontWeight: isSelected ? 700 : 500,
                        cursor: "pointer",
                        boxShadow: isSelected ? `0 4px 14px ${style.color}35` : "none",
                        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)"
                      }}
                    >
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "6px",
                          background: isSelected ? style.color : isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                          color: isSelected ? "#ffffff" : style.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0
                        }}
                      >
                        <IconComponent size={13} />
                      </div>
                      <span style={{ whiteSpace: "nowrap" }}>{style.label}</span>
                      {isSelected && <Check size={13} style={{ marginLeft: "auto", color: style.color }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Notice */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: isLight ? "#dc2626" : "#fca5a5",
                  fontSize: "12px",
                  fontWeight: 500
                }}
              >
                {error}
              </div>
            )}

            {/* Generating Progress Indicator */}
            {isGenerating && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: isLight ? "#7c3aed" : "#c084fc",
                    fontWeight: 700
                  }}
                >
                  <span>Synthesizing artwork with AI...</span>
                  <span>{progress}%</span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "6px",
                    borderRadius: "9999px",
                    background: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: "9999px",
                      background: "#6366f1",
                      transition: "width 0.3s ease"
                    }}
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
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
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Conditioning & Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Generate Artwork</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
