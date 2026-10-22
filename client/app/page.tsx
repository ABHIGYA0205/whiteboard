"use client";

import { createBoard } from "@/lib/api";
import { CanvasFlowLogo } from "@/components/Common/CanvasFlowLogo";
import { DashboardVideoPreview } from "@/components/Common/DashboardVideoPreview";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
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
  Download,
  Loader2,
  PenTool,
  Check
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [visibleItems, setVisibleItems] = useState<Record<string, boolean>>({});

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

  // Scroll animation observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-anim-id");
            if (id) {
              setVisibleItems((prev) => ({ ...prev, [id]: true }));
            }
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    const elements = document.querySelectorAll("[data-anim-id]");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const features = [
    {
      id: "feat-1",
      icon: <Users size={20} color="#818cf8" />,
      title: "Multiplayer Live Presence",
      badge: "Real-time Sync",
      desc: "Synchronized live collaborator cursors, name badges, and element updates with sub-16ms latency across unlimited participants."
    },
    {
      id: "feat-2",
      icon: <Workflow size={20} color="#60a5fa" />,
      title: "Prompt → Native Diagrams",
      badge: "Editable Graphs",
      desc: "Transform plain text system architecture descriptions into fully editable vector nodes, process flows, and connected cards."
    },
    {
      id: "feat-3",
      icon: <Wand2 size={20} color="#a78bfa" />,
      title: "AI Studio & Image Gen",
      badge: "7 Curated Styles",
      desc: "Generate high-resolution illustrations directly on your canvas across Digital Art, Photorealistic, 3D Render, Anime, and Vector styles."
    },
    {
      id: "feat-4",
      icon: <LayoutTemplate size={20} color="#34d399" />,
      title: "Curated Canvas Templates",
      badge: "One-Click Setup",
      desc: "Launch instantly with pre-built architectural flowcharts, Kanban boards, sprint retrospective matrices, and brainstorming mind maps."
    },
    {
      id: "feat-5",
      icon: <Layers size={20} color="#38bdf8" />,
      title: "Multi-Select & Batch Drag",
      badge: "Ergonomics",
      desc: "Box-select groups of shapes, freehand sketches, and text cards to reposition, resize, align, or batch-delete seamlessly."
    },
    {
      id: "feat-6",
      icon: <Sparkles size={20} color="#f472b6" />,
      title: "AI Sketch Enhancer",
      badge: "Vector Refine",
      desc: "Turn rough whiteboard doodles and freehand diagrams into clean, professional digital artwork with toolbar style presets."
    },
    {
      id: "feat-7",
      icon: <Compass size={20} color="#fbbf24" />,
      title: "Interactive Radar Minimap",
      badge: "Spatial View",
      desc: "High-altitude overview showing live element locations across unbounded canvas coordinates with one-click viewport teleportation."
    },
    {
      id: "feat-8",
      icon: <Share2 size={20} color="#818cf8" />,
      title: "Role-Based Board Sharing",
      badge: "Permissions",
      desc: "Secure shareable links with granular Editor or Viewer controls to present and review boards without accidental changes."
    },
    {
      id: "feat-9",
      icon: <Download size={20} color="#a3e635" />,
      title: "Lossless Export & Snapshots",
      badge: "Vector & JSON",
      desc: "Export high-resolution transparent PNGs, scalable SVGs, or raw JSON snapshots for documentation, slides, and offline backups."
    }
  ];

  return (
    <main
      className="home-root"
      style={{
        backgroundColor: "#090a10",
        minHeight: "100vh",
        width: "100%",
        margin: 0,
        padding: "0 1.5rem 5rem",
        boxSizing: "border-box",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowX: "hidden",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      <div style={{ maxWidth: "1200px", width: "100%" }}>
        {/* Navigation / Header */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.75rem 0",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            marginBottom: "3.5rem"
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 700,
              fontSize: "1.25rem",
              letterSpacing: "-0.02em"
            }}
          >
            <CanvasFlowLogo size={32} />
            <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Canvas Flow
            </span>
          </div>

          {/* Status Indicator (Clean & Professional) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "9999px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "12px",
              fontWeight: 500,
              color: "#94a3b8"
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                boxShadow: "0 0 8px #10b981"
              }}
            />
            <span>Multiplayer Engine Active</span>
          </div>
        </header>

        {/* Hero Section - Focused, Clean, Professional */}
        <section
          style={{
            textAlign: "center",
            padding: "2rem 0 4rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          {/* Headline */}
          <h1
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: "880px",
              margin: "0 0 1.5rem",
              color: "#ffffff"
            }}
          >
            The infinite canvas built for <br />
            <span style={{ color: "#93c5fd" }}>real-time collaboration.</span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
              lineHeight: 1.6,
              color: "#94a3b8",
              maxWidth: "620px",
              margin: "0 0 2.5rem"
            }}
          >
            Sketch diagrams, generate editable flowcharts from prompts, and collaborate simultaneously with your team with sub-second sync.
          </p>

          {/* THE ONLY BOARD CREATION BUTTON */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <button
              onClick={handleCreateBoard}
              disabled={isPending}
              id="hero-create-board-btn"
              style={{
                backgroundColor: "#6366f1",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                padding: "1rem 2.25rem",
                fontSize: "1.05rem",
                fontWeight: 600,
                borderRadius: "12px",
                cursor: isPending ? "wait" : "pointer",
                boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.backgroundColor = "#4f46e5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.backgroundColor = "#6366f1";
              }}
            >
              {isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Launching Canvas...</span>
                </>
              ) : (
                <>
                  <span>Create New Board</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Instant launch • No account required</span>
          </div>

          {error && <p style={{ color: "#ef4444", marginTop: "1rem", fontSize: "14px" }}>{error}</p>}

          {/* Interactive Canvas Demo Video (Infinite Loop) */}
          <DashboardVideoPreview />
        </section>

        {/* Section Header */}
        <div
          data-anim-id="features-header"
          style={{
            textAlign: "center",
            margin: "4rem 0 2.5rem",
            opacity: visibleItems["features-header"] ? 1 : 0,
            transform: visibleItems["features-header"] ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
          }}
        >
          <h2
            style={{
              fontSize: "clamp(1.75rem, 3.5vw, 2.35rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              margin: "0 0 0.5rem"
            }}
          >
            Engineered for Modern Engineering Teams
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "1rem", margin: 0 }}>
            Nine integrated capabilities for high-velocity visual thinking and planning.
          </p>
        </div>

        {/* Features Grid: EXACTLY 9 CARDS in an even, balanced 3x3 layout */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.25rem",
            marginBottom: "5rem"
          }}
        >
          {features.map((item, idx) => {
            const isVisible = visibleItems[item.id];
            return (
              <div
                key={item.id}
                data-anim-id={item.id}
                className="feature-card-clean"
                style={{
                  background: "#11121c",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: "16px",
                  padding: "1.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(24px)",
                  transition: `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.06}s`,
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {item.icon}
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#94a3b8"
                    }}
                  >
                    {item.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  {item.title}
                </h3>

                <p style={{ color: "#94a3b8", fontSize: "0.925rem", lineHeight: 1.6, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </section>

        {/* Footer */}
        <footer
          style={{
            padding: "2.5rem 0 1rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            textAlign: "center",
            color: "#64748b",
            fontSize: "0.85rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8" }}>
            <Check size={14} color="#10b981" />
            <span>Zero install required • Works in all modern browsers</span>
          </div>
          <p style={{ margin: "4px 0 0" }}>
            © {new Date().getFullYear()} CanvasFlow. Professional infinite canvas for high-performance teams.
          </p>
        </footer>
      </div>

      {/* Floating animation keyframes for preview cursor motions */}
      <style>{`
        @keyframes cursorDrift1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(25px, -15px); }
        }
        @keyframes cursorDrift2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, 12px); }
        }
        .floating-cursor-1 {
          animation: cursorDrift1 4.5s ease-in-out infinite;
        }
        .floating-cursor-2 {
          animation: cursorDrift2 5.5s ease-in-out infinite;
        }
        .feature-card-clean {
          transition: transform 0.25s ease, border-color 0.25s ease, background-color 0.25s ease;
        }
        .feature-card-clean:hover {
          transform: translateY(-4px) !important;
          border-color: rgba(99, 102, 241, 0.35) !important;
          background-color: #141624 !important;
        }
      `}</style>
    </main>
  );
}
