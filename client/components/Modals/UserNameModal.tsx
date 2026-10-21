"use client";

import { useState, useEffect, useRef } from "react";
import { UserCheck, Sparkles, ArrowRight, User } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";

type UserNameModalProps = {
  isOpen: boolean;
  initialName?: string;
  onSave: (name: string) => void;
  onClose?: () => void;
};

export function UserNameModal({ isOpen, initialName = "", onSave, onClose }: UserNameModalProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  useEffect(() => {
    if (isOpen) {
      setName(initialName || localStorage.getItem("whiteboard_user_name") || "");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent dismissing modal before setting name on first entry
      if (e.key === "Escape" && isOpen && localStorage.getItem("whiteboard_user_name")) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem("whiteboard_user_name", trimmed);
      onSave(trimmed);
      onClose?.();
    }
  };

  const getInitials = (str: string) => {
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase() || "YOU";
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
    >
      <div
        style={{
          position: "relative",
          background: isLight ? "#ffffff" : "linear-gradient(160deg, #181926 0%, #0f1019 100%)",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "440px",
          padding: "36px 32px 32px",
          boxShadow: isLight
            ? "0 25px 60px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)"
            : "0 30px 80px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          textAlign: "center",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top ambient glow */}
        <div
          style={{
            position: "absolute",
            top: "-60px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "200px",
            height: "100px",
            background: "linear-gradient(135deg, #6366f1, #d946ef)",
            filter: "blur(50px)",
            opacity: isLight ? 0.25 : 0.45,
            pointerEvents: "none"
          }}
        />

        {/* Avatar header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", position: "relative" }}>
          <div
            style={{
              position: "relative",
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              fontWeight: 800,
              color: "#ffffff",
              boxShadow: "0 8px 24px rgba(99, 102, 241, 0.45)",
              border: "3px solid rgba(255, 255, 255, 0.25)"
            }}
          >
            {name.trim() ? getInitials(name) : <Sparkles size={28} />}
          </div>

          <div>
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: isLight ? "#0f172a" : "#f8fafc",
                margin: "0 0 6px",
                letterSpacing: "-0.02em"
              }}
            >
              Who is joining?
            </h2>
            <p style={{ fontSize: "13px", color: isLight ? "#64748b" : "#94a3b8", margin: 0, lineHeight: 1.5 }}>
              Choose your display name for real-time live collaboration
            </p>
          </div>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative" }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: isLight ? "#94a3b8" : "#64748b",
                display: "flex",
                alignItems: "center",
                pointerEvents: "none"
              }}
            >
              <User size={18} />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              aria-label="Your name"
              style={{
                width: "100%",
                padding: "13px 16px 13px 42px",
                borderRadius: "14px",
                background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.05)",
                border: isLight ? "1.5px solid #cbd5e1" : "1.5px solid rgba(255, 255, 255, 0.12)",
                color: isLight ? "#0f172a" : "#ffffff",
                fontSize: "15px",
                fontWeight: 600,
                outline: "none",
                boxSizing: "border-box",
                transition: "all 0.2s ease"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#6366f1";
                e.target.style.boxShadow = "0 0 0 4px rgba(99, 102, 241, 0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = isLight ? "#cbd5e1" : "rgba(255, 255, 255, 0.12)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              padding: "13px 24px",
              borderRadius: "14px",
              background: name.trim()
                ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)"
                : isLight
                ? "#e2e8f0"
                : "rgba(255, 255, 255, 0.08)",
              color: name.trim() ? "#ffffff" : isLight ? "#94a3b8" : "#64748b",
              border: "none",
              fontWeight: 700,
              fontSize: "14px",
              cursor: name.trim() ? "pointer" : "not-allowed",
              boxShadow: name.trim() ? "0 6px 20px rgba(99, 102, 241, 0.4)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            <UserCheck size={18} />
            <span>Continue to Board</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
