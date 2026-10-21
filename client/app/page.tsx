"use client";

import { createBoard } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Sparkles,
  MousePointer2,
  Workflow,
  Wand2,
  LayoutTemplate,
  Users,
  Compass,
  Share2,
  Layers,
  ArrowRight,
  Shield,
  Zap,
  CheckCircle2,
  Loader2
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCreateBoard = () => {
    startTransition(async () => {
      try {
        setError(null);
        const board = await createBoard();
        router.push(`/board/${board.id}`);
      } catch {
        const fallbackId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 11);
        router.push(`/board/${fallbackId}`);
      }
    });
  };

  return (
    <main
      className="home-shell-custom"
      style={{
        background: "radial-gradient(ellipse at top, #1e1b4b 0%, #0c0a1a 45%, #030712 100%)",
        minHeight: "100vh",
        width: "100%",
        margin: 0,
        padding: "2.5rem 1.5rem 4rem",
        boxSizing: "border-box",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}
    >
      <div className="home-container" style={{ maxWidth: "1240px", width: "100%" }}>
        {/* Header / Nav */}
        <header
          className="home-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "3.5rem",
            padding: "0.5rem 0"
          }}
        >
          <div
            className="home-logo"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
              fontWeight: 800,
              fontSize: "1.45rem",
              color: "#ffffff",
              letterSpacing: "-0.02em"
            }}
          >
            <div
              className="home-logo-icon"
              style={{
                width: "36px",
                height: "36px",
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)"
              }}
            >
              <Sparkles size={20} />
            </div>
            <span>Whiteboard</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "9999px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                fontSize: "12px",
                fontWeight: 600,
                color: "#34d399"
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  boxShadow: "0 0 6px #10b981"
                }}
              />
              <span>Multiplayer Live</span>
            </div>

            <button
              onClick={handleCreateBoard}
              disabled={isPending}
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#ffffff",
                border: "none",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 700,
                borderRadius: "10px",
                cursor: isPending ? "wait" : "pointer",
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
                transition: "all 0.2s ease"
              }}
            >
              {isPending ? "Creating..." : "Open Canvas"}
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="hero-section" style={{ margin: "1rem 0 5rem" }}>
          {/* Left: Video / Preview */}
          <div
            className="hero-video-container"
            style={{
              borderRadius: "28px",
              overflow: "hidden",
              aspectRatio: "16/9",
              position: "relative",
              background: "#0c0d14",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 30px 80px rgba(0, 0, 0, 0.7), 0 0 50px rgba(99, 102, 241, 0.2)"
            }}
          >
            <video
              src="/trailer.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="hero-video"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="hero-video-overlay" />
          </div>

          {/* Right: Text Content */}
          <div className="hero-text-container">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 14px",
                borderRadius: "9999px",
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(236, 72, 153, 0.2))",
                border: "1px solid rgba(168, 85, 247, 0.35)",
                fontSize: "12px",
                fontWeight: 700,
                color: "#f5d0fe",
                marginBottom: "1.25rem"
              }}
            >
              <Sparkles size={14} color="#d946ef" />
              <span>Studio AI • Native Diagrams • Real-Time Multiplayer</span>
            </div>

            <h1 className="hero-title" style={{ fontSize: "clamp(2.4rem, 4.5vw, 3.8rem)", fontWeight: 800, lineHeight: 1.15 }}>
              The infinite canvas for <br />
              <span className="hero-title-gradient">limitless collaboration.</span>
            </h1>

            <p className="hero-description" style={{ fontSize: "1.15rem", lineHeight: 1.6, color: "#94a3b8", margin: "1.25rem 0 2rem" }}>
              Sketch freely, generate AI artwork in 7 styles, build editable architecture diagrams from text prompts, and brainstorm in real time with your team.
            </p>

            <div className="hero-button-wrapper" style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                onClick={handleCreateBoard}
                disabled={isPending}
                className="hero-button"
                style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
                  color: "#ffffff",
                  border: "none",
                  padding: "1.15rem 2.25rem",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  borderRadius: "14px",
                  cursor: isPending ? "wait" : "pointer",
                  boxShadow: "0 10px 30px rgba(99, 102, 241, 0.45)",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px"
                }}
              >
                {isPending ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Launching Canvas...</span>
                  </>
                ) : (
                  <>
                    <span>Create New Board</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
            {error && <p className="hero-error" style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
          </div>
        </section>

        {/* Quick Value Metrics Bar */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1.25rem",
            marginBottom: "4.5rem",
            padding: "1.5rem",
            borderRadius: "20px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(12px)"
          }}
        >
          {[
            { label: "Live Collaboration", value: "Figma & Canva Style", desc: "Live cursors & presence stack" },
            { label: "AI Image Studio", value: "7 Curated Art Styles", desc: "High-resolution artwork generation" },
            { label: "Vector Diagrams", value: "Prompt → Native Graph", desc: "Editable boxes, labels & connectors" },
            { label: "Batch Transforms", value: "Multi-Select Box", desc: "Drag, reshape & delete together" }
          ].map((item, idx) => (
            <div key={idx} style={{ padding: "0.5rem" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#818cf8" }}>
                {item.label}
              </div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#f8fafc", margin: "4px 0" }}>
                {item.value}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {item.desc}
              </div>
            </div>
          ))}
        </section>

        {/* Features Grid */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#f8fafc", letterSpacing: "-0.02em" }}>
            Engineered for Modern Teams
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "1.05rem", margin: 0 }}>
            Everything you need for visual thinking, sprint planning, and generative AI design.
          </p>
        </div>

        <section
          className="features-grid-custom"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.5rem",
            marginBottom: "5rem"
          }}
        >
          {[
            {
              icon: <Users size={24} color="#818cf8" />,
              title: "Multiplayer Live Presence",
              badge: "Figma & Canva Style",
              desc: "See teammates' live named cursors, collaborator avatar stacks, and real-time edits synchronized with zero perceptible lag."
            },
            {
              icon: <Wand2 size={24} color="#ec4899" />,
              title: "AI Image Studio",
              badge: "7 Art Styles",
              desc: "Generate vibrant illustrations directly on your canvas across Digital Art, Photorealistic, 3D Render, Anime, Cyberpunk, Watercolor, and Vector styles."
            },
            {
              icon: <Workflow size={24} color="#6366f1" />,
              title: "Prompt → Native Diagrams",
              badge: "Editable Graphs",
              desc: "Transform plain text flow descriptions into fully editable vector nodes, process cards, and connector arrows in seconds."
            },
            {
              icon: <LayoutTemplate size={24} color="#a855f7" />,
              title: "Smart Workspace Templates",
              badge: "One-Click Load",
              desc: "Instant pre-built boards including Software Flowcharts, Kanban Boards, Sprint Retrospectives, and Brainstorming Mind Maps."
            },
            {
              icon: <Layers size={24} color="#06b6d4" />,
              title: "Multi-Select & Batch Drag",
              badge: "Canvas Ergonomics",
              desc: "Click and drag to box-select multiple drawings, shapes, and notes. Reposition, resize, reshape, or batch-delete effortlessly."
            },
            {
              icon: <Sparkles size={24} color="#d946ef" />,
              title: "AI Sketch Enhancer",
              badge: "Instant Polishing",
              desc: "Turn rough doodles and hand-drawn whiteboard sketches into high-fidelity graphics with intelligent style presets on the toolbar."
            },
            {
              icon: <Compass size={24} color="#10b981" />,
              title: "Interactive Radar Minimap",
              badge: "Spatial Navigation",
              desc: "High-altitude radar view showing real-time element locations across infinite coordinates with instant click-to-pan."
            },
            {
              icon: <Share2 size={24} color="#3b82f6" />,
              title: "Role-Based Board Sharing",
              badge: "Editor vs. Viewer",
              desc: "Generate secure shareable links with Editor or View-Only permission controls to present work safely without accidental changes."
            }
          ].map((feature, i) => (
            <div
              key={i}
              className="feature-item-custom"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.07)",
                borderRadius: "20px",
                padding: "2rem",
                backdropFilter: "blur(10px)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                transition: "all 0.25s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  className="feature-icon-wrapper"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "rgba(99, 102, 241, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(99, 102, 241, 0.25)"
                  }}
                >
                  {feature.icon}
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "9999px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#cbd5e1"
                  }}
                >
                  {feature.badge}
                </span>
              </div>
              <h3 className="feature-title" style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ffffff", margin: 0 }}>
                {feature.title}
              </h3>
              <p className="feature-desc" style={{ color: "#94a3b8", fontSize: "0.95rem", lineHeight: 1.6, margin: 0 }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </section>

        {/* Bottom CTA Banner */}
        <section
          style={{
            textAlign: "center",
            padding: "3.5rem 2rem",
            borderRadius: "24px",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(217, 70, 239, 0.15) 100%)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            marginBottom: "4rem"
          }}
        >
          <h3 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 0.75rem", color: "#ffffff" }}>
            Start sketching on your infinite canvas
          </h3>
          <p style={{ color: "#cbd5e1", maxWidth: "540px", margin: "0 auto 1.75rem", fontSize: "1.05rem" }}>
            No sign-up required. Launch an instant whiteboard session and invite your team in real time.
          </p>
          <button
            onClick={handleCreateBoard}
            disabled={isPending}
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              color: "#ffffff",
              border: "none",
              padding: "1rem 2.25rem",
              fontSize: "1.05rem",
              fontWeight: 700,
              borderRadius: "12px",
              cursor: isPending ? "wait" : "pointer",
              boxShadow: "0 8px 24px rgba(99, 102, 241, 0.4)",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>Launch Whiteboard</span>
            <ArrowRight size={16} />
          </button>
        </section>

        {/* Footer */}
        <footer
          className="home-footer"
          style={{
            padding: "2rem 0",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            textAlign: "center",
            color: "#64748b",
            fontSize: "0.875rem"
          }}
        >
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Whiteboard. Built for professional visual thinking and team collaboration.</p>
        </footer>
      </div>
    </main>
  );
}
