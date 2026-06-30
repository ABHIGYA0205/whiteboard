"use client";

import { createBoard } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles, MousePointer2, Download, Zap, Maximize, Shield } from "lucide-react";

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
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Failed to create board."
        );
      }
    });
  };

  return (
    <main className="home-shell-custom">
      <div className="home-container">
        {/* Header / Nav */}
        <header className="home-header">
          <div className="home-logo">
            <div className="home-logo-icon"></div>
            Whiteboard
          </div>
        </header>

        {/* Split Hero Section */}
        <section className="hero-section">
          {/* Left: Video */}
          <div className="hero-video-container">
            <video 
              src="/trailer.mp4" 
              autoPlay 
              loop 
              muted 
              playsInline 
              className="hero-video"
            />
            <div className="hero-video-overlay" />
          </div>

          {/* Right: Text Content */}
          <div className="hero-text-container">
            <h1 className="hero-title">
              The infinite canvas for <br/>
              <span className="hero-title-gradient">limitless creativity.</span>
            </h1>
            <p className="hero-description">
              A professional whiteboard designed to help you sketch, think, and build effortlessly. Powered by advanced AI enhancements.
            </p>
            
            <div className="hero-button-wrapper">
              <button
                disabled={isPending}
                onClick={handleCreateBoard}
                className="hero-button"
              >
                {isPending ? "Starting your session..." : "Create New Board"}
              </button>
            </div>
            {error && <p className="hero-error">{error}</p>}
          </div>
        </section>

        {/* Features Grid */}
        <section className="features-grid-custom">
          {[
            { icon: <Sparkles size={24} color="#a5a6f6" />, title: "AI Enhancements", desc: "Turn rough sketches into professional illustrations instantly with cutting-edge AI." },
            { icon: <Maximize size={24} color="#a5a6f6" />, title: "Infinite Canvas", desc: "Never run out of space with an endless canvas that expands as your ideas grow." },
            { icon: <MousePointer2 size={24} color="#a5a6f6" />, title: "Precision Tools", desc: "A full suite of drawing, shape, and text tools for complete creative control." },
            { icon: <Download size={24} color="#a5a6f6" />, title: "Local Export", desc: "Save your work as high-quality PNGs or JSON state files to keep your data safe." },
            { icon: <Shield size={24} color="#a5a6f6" />, title: "Canvas Locking", desc: "Lock the canvas to prevent accidental edits while presenting or reviewing work." },
            { icon: <Zap size={24} color="#a5a6f6" />, title: "Lightning Fast", desc: "Built on Next.js and optimized HTML5 Canvas for zero-latency drawing." },
          ].map((feature, i) => (
            <div key={i} className="feature-item-custom">
              <div className="feature-icon-wrapper">
                {feature.icon}
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer className="home-footer">
          <p>© {new Date().getFullYear()} Built for professional visual thinking.</p>
        </footer>
      </div>
    </main>
  );
}
