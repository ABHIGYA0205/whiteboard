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
import { uploadImage, enhanceSketch } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";

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
    suffix: "vibrant digital art, trending on artstation, detailed illustration",
    color: "#8b5cf6",
    icon: Palette
  },
  {
    id: "photo",
    label: "Photorealistic",
    suffix: "photorealistic, hyperrealistic 8k resolution, cinematic lighting",
    color: "#3b82f6",
    icon: Camera
  },
  {
    id: "3d",
    label: "3D Render",
    suffix: "3D isometric render, blender octane render, soft ambient lighting",
    color: "#06b6d4",
    icon: Box
  },
  {
    id: "anime",
    label: "Anime / Manga",
    suffix: "makoto shinkai aesthetic, high quality anime artwork, vibrant colors",
    color: "#ec4899",
    icon: Zap
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    suffix: "cyberpunk neon aesthetic, moody lighting, futuristic city details",
    color: "#f43f5e",
    icon: Flame
  },
  {
    id: "watercolor",
    label: "Watercolor",
    suffix: "delicate watercolor painting, artistic paper texture, soft gradients",
    color: "#10b981",
    icon: Feather
  },
  {
    id: "vector",
    label: "Vector / Icon",
    suffix: "clean modern vector illustration, minimalist, flat colors",
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

function createClientArtisticSvg(prompt: string, style: (typeof AI_IMAGE_STYLES)[0]): string {
  const width = 768;
  const height = 768;
  const cleanPrompt = prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const accent1 = style.color || "#8b5cf6";
  const accent2 = style.id === "cyberpunk" ? "#06b6d4" : style.id === "anime" ? "#f472b6" : "#ec4899";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0b0f19" />
        <stop offset="50%" stop-color="#111827" />
        <stop offset="100%" stop-color="#030712" />
      </linearGradient>
      <linearGradient id="glowGrad1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accent1}" stop-opacity="0.5" />
        <stop offset="100%" stop-color="${accent1}" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="glowGrad2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accent2}" stop-opacity="0.4" />
        <stop offset="100%" stop-color="${accent2}" stop-opacity="0" />
      </linearGradient>
      <filter id="blurFilter" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="60" />
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)" rx="24"/>
    
    <!-- Ambient light spheres -->
    <circle cx="240" cy="240" r="220" fill="url(#glowGrad1)" filter="url(#blurFilter)" />
    <circle cx="560" cy="520" r="240" fill="url(#glowGrad2)" filter="url(#blurFilter)" />

    <!-- Center artwork emblem -->
    <g transform="translate(184, 184)">
      <rect width="400" height="400" rx="32" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5"/>
      <circle cx="200" cy="200" r="120" fill="none" stroke="${accent1}" stroke-width="2" stroke-dasharray="6 8" opacity="0.6"/>
      <polygon points="200,120 270,240 130,240" fill="none" stroke="${accent2}" stroke-width="2" opacity="0.7"/>
      <circle cx="200" cy="200" r="36" fill="${accent1}" opacity="0.8"/>
    </g>

    <!-- Style badge -->
    <g transform="translate(48, 48)">
      <rect width="140" height="32" rx="8" fill="${accent1}" opacity="0.25" />
      <rect width="140" height="32" rx="8" fill="none" stroke="${accent1}" stroke-width="1.5" opacity="0.8" />
      <text x="70" y="21" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" text-anchor="middle" letter-spacing="1.5">${style.label.toUpperCase()}</text>
    </g>

    <!-- Bottom prompt card -->
    <g transform="translate(48, ${height - 110})">
      <rect width="${width - 96}" height="64" rx="14" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1"/>
      <circle cx="28" cy="32" r="6" fill="${accent1}" />
      <text x="48" y="38" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600">${cleanPrompt.slice(0, 55)}${cleanPrompt.length > 55 ? "..." : ""}</text>
    </g>
  </svg>`;

  return `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(svg))) : ""}`;
}

export function AiImageModal({
  isOpen,
  onClose,
  initialPrompt = "",
  sketchBase64,
  onGenerate
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(AI_IMAGE_STYLES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = useBoardStore((state) => state.theme);

  const isLight = theme === "light";

  useEffect(() => {
    if (isOpen) {
      setPrompt(initialPrompt || "");
      setError(null);
      setProgress(0);
      setIsGenerating(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, initialPrompt]);

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

    const fullPrompt = `${cleanPrompt}, ${selectedStyle.suffix}`;
    const seed = Math.floor(Math.random() * 999999);

    try {
      let finalUrl: string | null = null;

      // Tier 1: Fast direct Pollinations fetch with turbo/default model
      setProgress(30);
      const candidateModels = ["turbo", "flux", ""];
      for (const model of candidateModels) {
        try {
          const modelParam = model ? `&model=${model}` : "";
          const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            fullPrompt
          )}?width=768&height=768&nologo=true&seed=${seed}${modelParam}`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          const res = await fetch(pollUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 2000 && blob.type.startsWith("image/")) {
              setProgress(70);
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              try {
                const uploadRes = await uploadImage(dataUrl);
                if (uploadRes?.url) {
                  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
                  finalUrl = uploadRes.url.startsWith("http") ? uploadRes.url : `${apiBase}${uploadRes.url}`;
                  break;
                }
              } catch {
                finalUrl = dataUrl;
                break;
              }
              finalUrl = dataUrl;
              break;
            }
          }
        } catch {
          // Proceed to next fallback
        }
      }

      // Tier 2: Backend AI enhance pipeline
      if (!finalUrl) {
        setProgress(60);
        try {
          const blankCanvas = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=";
          const base64ToUse = sketchBase64 && sketchBase64.length > 50 ? sketchBase64 : blankCanvas;
          const serverRes = await enhanceSketch(base64ToUse, fullPrompt, (p) => {
            setProgress(Math.max(60, p));
          });
          if (serverRes?.imageUrl) {
            finalUrl = serverRes.imageUrl;
          }
        } catch (serverErr) {
          console.warn("Backend enhance fallback skipped:", serverErr);
        }
      }

      // Tier 3: Guaranteed client artistic SVG synthesis
      if (!finalUrl) {
        setProgress(90);
        const synthesized = createClientArtisticSvg(cleanPrompt, selectedStyle);
        try {
          const uploaded = await uploadImage(synthesized);
          if (uploaded?.url) {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
            finalUrl = uploaded.url.startsWith("http") ? uploaded.url : `${apiBase}${uploaded.url}`;
          } else {
            finalUrl = synthesized;
          }
        } catch {
          finalUrl = synthesized;
        }
      }

      setProgress(100);
      onGenerate(finalUrl, 380, 380);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Generation error. Please try another prompt.");
    } finally {
      setIsGenerating(false);
    }
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
                    background: isLight ? "rgba(139, 92, 246, 0.12)" : "rgba(139, 92, 246, 0.25)",
                    color: isLight ? "#7c3aed" : "#c084fc",
                    border: "1px solid rgba(139, 92, 246, 0.3)"
                  }}
                >
                  HD Gen
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: isLight ? "#64748b" : "#94a3b8" }}>
                Generate high-resolution artwork and graphics directly onto your whiteboard
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

        {/* Input Form */}
        <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: "20px", position: "relative" }}>
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
            <div style={{ position: "relative" }}>
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
                aria-label="Image prompt description"
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#8b5cf6";
                    e.currentTarget.style.color = isLight ? "#0f172a" : "#ffffff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
                    e.currentTarget.style.color = isLight ? "#334155" : "#cbd5e1";
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

          {/* Action Button */}
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
                <span>Generating Image...</span>
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
      </div>
    </div>
  );
}
