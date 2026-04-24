"use client";

import { createBoard } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles, MousePointer2, Download, Zap, Share2, Shield } from "lucide-react";

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
    <main className="home-shell" style={{ 
      background: 'radial-gradient(circle at top, #1a1525 0%, #010409 100%)',
      minHeight: '100vh',
      height: '100vh',
      width: '100vw',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '4rem 2rem',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ maxWidth: '1200px', width: '100%' }}>
        {/* Header / Nav */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 'bold', fontSize: '1.5rem', color: '#fff' }}>
            <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #6965db, #ff6b6b)', borderRadius: '8px' }}></div>
            Whiteboard
          </div>
          <button style={{ background: 'transparent', color: '#a0aec0', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 500 }} onClick={() => window.open('https://github.com/google/antigravity', '_blank')}>
            About Project
          </button>
        </header>

        {/* Hero Section */}
        <section style={{ textAlign: 'center', margin: '4rem 0 6rem 0' }}>
          <div style={{ display: 'inline-block', padding: '0.5rem 1rem', background: 'rgba(105, 101, 219, 0.1)', color: '#a5a6f6', borderRadius: '20px', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.5rem', border: '1px solid rgba(105, 101, 219, 0.2)' }}>
            ✨ Version 2.0 is now live
          </div>
          <h1 style={{ fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '1.5rem', color: '#fff' }}>
            The infinite canvas for <br/>
            <span style={{ background: 'linear-gradient(to right, #a5a6f6, #ff8a8a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>limitless creativity.</span>
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#a0aec0', maxWidth: '600px', margin: '0 auto 2.5rem auto', lineHeight: 1.6 }}>
            A professional, real-time collaborative whiteboard designed for teams to sketch, think, and build together. Powered by advanced AI enhancements.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              disabled={isPending}
              onClick={handleCreateBoard}
              style={{
                background: 'linear-gradient(135deg, #6965db, #5551c4)',
                color: 'white',
                border: 'none',
                padding: '1.25rem 2.5rem',
                fontSize: '1.125rem',
                fontWeight: 600,
                borderRadius: '12px',
                cursor: isPending ? 'wait' : 'pointer',
                boxShadow: '0 10px 25px rgba(105, 101, 219, 0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                opacity: isPending ? 0.7 : 1,
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {isPending ? "Starting your session..." : "Create New Board"}
            </button>
          </div>
          {error && <p style={{ color: '#ff6b6b', marginTop: '1rem' }}>{error}</p>}
        </section>

        {/* Features Grid */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', marginTop: '4rem' }}>
          {[
            { icon: <Sparkles size={24} color="#a5a6f6" />, title: "AI Enhancements", desc: "Turn rough sketches into professional illustrations instantly with cutting-edge AI." },
            { icon: <Share2 size={24} color="#a5a6f6" />, title: "Real-time Collaboration", desc: "Work together with your team seamlessly with live cursors and instant syncing." },
            { icon: <MousePointer2 size={24} color="#a5a6f6" />, title: "Precision Tools", desc: "A full suite of drawing, shape, and text tools for complete creative control." },
            { icon: <Download size={24} color="#a5a6f6" />, title: "Local Export", desc: "Save your work as high-quality PNGs or JSON state files to keep your data safe." },
            { icon: <Shield size={24} color="#a5a6f6" />, title: "Canvas Locking", desc: "Lock the canvas to prevent accidental edits while presenting or reviewing work." },
            { icon: <Zap size={24} color="#a5a6f6" />, title: "Lightning Fast", desc: "Built on Next.js and optimized HTML5 Canvas for zero-latency drawing." },
          ].map((feature, i) => (
            <div key={i} style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '2.5rem 2rem',
              borderRadius: '24px',
              backdropFilter: 'blur(10px)',
              transition: 'transform 0.3s, background 0.3s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
            }}
            >
              <div style={{ background: 'rgba(105, 101, 219, 0.1)', width: '56px', height: '56px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid rgba(105, 101, 219, 0.2)' }}>
                {feature.icon}
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}>{feature.title}</h3>
              <p style={{ color: '#a0aec0', lineHeight: 1.6 }}>{feature.desc}</p>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: '8rem', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '3rem 0', textAlign: 'center', color: '#718096', fontSize: '0.875rem' }}>
          <p>© {new Date().getFullYear()} Built for professional visual thinking.</p>
        </footer>
      </div>
    </main>
  );
}
