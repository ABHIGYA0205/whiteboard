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
  ArrowRight
} from "lucide-react";
import { generateAiImage, getAiCapabilities, type AiAvailability, type AiCapabilities, type GenerateAiImageResult } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";

type AiImageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  sketchBase64?: string;
  isClusterUsed?: boolean;
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

const availabilityMessage: Record<NonNullable<AiAvailability>, string> = {
  not_configured: "Image generation needs a provider key on this server.",
  credit: "The configured image providers are out of generation credit. Contact the site owner.",
  key: "The image provider rejected this server’s key. Contact the site owner.",
  permission: "This server’s key needs permission to generate images.",
  unreachable: "Could not reach the image service. Close and reopen the studio to retry."
};

export function AiImageModal({
  isOpen,
  onClose,
  initialPrompt = "",
  sketchBase64,
  isClusterUsed = false,
  onGenerate
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(AI_IMAGE_STYLES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeSketch, setActiveSketch] = useState<string | undefined>(undefined);
  const [clusterNotice, setClusterNotice] = useState(false);
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GenerateAiImageResult | null>(null);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  // Capture sketch and initialize state ONCE when modal opens (2.3)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setPrompt(initialPrompt || "");
      setError(null);
      setProgress(0);
      setIsGenerating(false);
      setGeneratedResult(null);
      setNaturalDimensions(null);
      setCapabilities(null);
      setActiveSketch(sketchBase64 || undefined);
      setClusterNotice(Boolean(isClusterUsed));

      getAiCapabilities().then((caps) => {
        setCapabilities(caps);
      });

      if (window.matchMedia("(pointer: fine) and (min-width: 700px)").matches) {
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialPrompt, sketchBase64, isClusterUsed]);

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

  const hasSketch = Boolean(activeSketch);
  const useSketch = hasSketch && Boolean(capabilities?.sketch);
  const canGenerate = useSketch || Boolean(capabilities?.text);
  const canSubmit = canGenerate && !isGenerating && Boolean(prompt.trim());
  const badgeLabel = useSketch ? "Sketch-guided" : "Text to image";
  const buttonLabel = useSketch ? "Generate from sketch" : "Generate from text";

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("Please describe what image you want to create.");
      return;
    }
    if (!canSubmit) return;

    setIsGenerating(true);
    setProgress(15);
    setError(null);
    setGeneratedResult(null);
    setNaturalDimensions(null);

    try {
      const res = await generateAiImage(
        {
          imageBase64: useSketch ? activeSketch : undefined,
          prompt: cleanPrompt,
          styleId: selectedStyle.id,
          allowTextOnly: !useSketch
        },
        (p) => setProgress(Math.max(15, p))
      );

      setProgress(100);
      setGeneratedResult(res);
    } catch (err: any) {
      if (["SKETCH_UNAVAILABLE", "AI_NOT_CONFIGURED", "IMAGE_CREDIT", "IMAGE_ACCESS"].includes(err?.code)) {
        setCapabilities(await getAiCapabilities());
      }
      setError(err?.message || "Image service unavailable. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = () => {
    if (generatedResult?.imageUrl && naturalDimensions) {
      onGenerate(generatedResult.imageUrl, naturalDimensions.width, naturalDimensions.height);
      onClose();
    }
  };

  const resultCaption = generatedResult ? [
    generatedResult.provider,
    generatedResult.sketchGuided ? "Sketch-guided" : "Generated from text"
  ].filter(Boolean).join(" · ") : "";

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
          padding: "clamp(14px, 4vw, 28px)",
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
        className="editor-dialog ai-image-dialog"
        role="dialog"
        aria-modal="true"
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
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px 8px" }}>
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
                    background: useSketch
                      ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.25)"
                      : isLight ? "rgba(139, 92, 246, 0.12)" : "rgba(139, 92, 246, 0.25)",
                    color: useSketch
                      ? (isLight ? "#059669" : "#34d399")
                      : (isLight ? "#7c3aed" : "#c084fc"),
                    border: useSketch
                      ? "1px solid rgba(16, 185, 129, 0.3)"
                      : "1px solid rgba(139, 92, 246, 0.3)"
                  }}
                >
                  {badgeLabel}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: isLight ? "#64748b" : "#94a3b8" }}>
                Generate images from your whiteboard drawing or text description
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

        {/* Result Preview Screen */}
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
                onLoad={(e) => {
                  const target = e.currentTarget;
                  if (target.naturalWidth && target.naturalHeight) {
                    setNaturalDimensions({
                      width: target.naturalWidth,
                      height: target.naturalHeight
                    });
                  }
                }}
                style={{
                  maxWidth: "100%",
                  maxHeight: "360px",
                  objectFit: "contain",
                  display: "block"
                }}
                onError={() => {
                  setGeneratedResult(null);
                  setError("Could not load the generated image. Try again.");
                }}
              />
            </div>

            {/* Provenance Caption (3.7) */}
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: isLight ? "#475569" : "#cbd5e1",
                textAlign: "center",
                padding: "6px 12px",
                borderRadius: "8px",
                background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.05)"
              }}
            >
              {resultCaption}
            </div>

            {/* Action buttons */}
            <div className="ai-image-actions" style={{ display: "flex", width: "100%", gap: "10px", marginTop: "6px" }}>
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
                disabled={!naturalDimensions}
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
            {hasSketch ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.03)",
                    border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.08)"
                  }}
                >
                  {/* Exact PNG thumbnail (2.3) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeSketch}
                    alt="Sketch thumbnail"
                    style={{
                      width: "48px",
                      height: "48px",
                      objectFit: "contain",
                      borderRadius: "6px",
                      background: "#ffffff",
                      border: "1px solid rgba(0,0,0,0.15)"
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: isLight ? "#1e293b" : "#f1f5f9" }}>
                      {useSketch
                        ? "This is what the AI will see"
                        : "Your drawing - not used, pictures are made from text only"}
                    </div>
                    {clusterNotice && (
                      <div style={{ fontSize: "11px", color: isLight ? "#64748b" : "#94a3b8", marginTop: "2px" }}>
                        Using the drawing around your last stroke. Select shapes first to choose exactly what is sent.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSketch(undefined)}
                    disabled={isGenerating}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "4px 8px",
                      fontSize: "12px",
                      color: isLight ? "#64748b" : "#94a3b8",
                      cursor: isGenerating ? "not-allowed" : "pointer",
                      textDecoration: "underline",
                      flexShrink: 0,
                      minHeight: "44px"
                    }}
                  >
                    Use text only
                  </button>
                </div>

                {capabilities && !useSketch && capabilities.text && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: isLight ? "#b45309" : "#fcd34d",
                      background: isLight ? "#fef3c7" : "rgba(245, 158, 11, 0.12)",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: isLight ? "1px solid #fde68a" : "1px solid rgba(245, 158, 11, 0.25)"
                    }}
                  >
                    Sketch generation is unavailable. You can generate from text.
                  </div>
                )}
              </div>
            ) : null}

            {capabilities?.textReason && !useSketch && (
              <p role="status" className="ai-image-notice">{availabilityMessage[capabilities.textReason]}</p>
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
                  {prompt.length}/300
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
                maxLength={300}
                placeholder="e.g. A cybernetic warrior standing in the rain"
                aria-label="Image prompt description"
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  borderRadius: "14px",
                  background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.05)",
                  border: isLight ? "1.5px solid #cbd5e1" : "1.5px solid rgba(255, 255, 255, 0.14)",
                  color: isLight ? "#0f172a" : "#ffffff",
                  fontSize: "16px",
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
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 128px), 1fr))",
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
                      <span>{style.label}</span>
                      {isSelected && <Check size={13} style={{ marginLeft: "auto", color: style.color }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Notice */}
            {error && (
              <div
                role="alert"
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
              <div role="status" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: isLight ? "#7c3aed" : "#c084fc",
                    fontWeight: 700
                  }}
                >
                  <span>Generating image with AI...</span>
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

            {/* Submit Button (3.7) */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: "14px 24px",
                borderRadius: "14px",
                background:
                  !canSubmit
                    ? isLight
                      ? "#e2e8f0"
                      : "rgba(255, 255, 255, 0.08)"
                    : "#6366f1",
                color:
                  !canSubmit
                    ? isLight
                      ? "#94a3b8"
                      : "#64748b"
                    : "#ffffff",
                border: "none",
                fontWeight: 700,
                fontSize: "15px",
                cursor: !canSubmit ? "not-allowed" : "pointer",
                boxShadow: !canSubmit ? "none" : "0 4px 14px rgba(99, 102, 241, 0.4)",
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
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>{capabilities ? buttonLabel : "Checking image service…"}</span>
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
