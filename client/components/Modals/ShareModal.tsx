"use client";

import { useState, useEffect } from "react";
import { X, Share2, Copy, Check, Eye, Edit3 } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";

type ShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  isViewer?: boolean;
};

export function ShareModal({ isOpen, onClose, boardId, isViewer = false }: ShareModalProps) {
  const [role, setRole] = useState<"editor" | "viewer">(isViewer ? "viewer" : "editor");
  const [copied, setCopied] = useState(false);
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  useEffect(() => {
    if (isViewer) {
      setRole("viewer");
    }
  }, [isViewer, isOpen]);

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

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const effectiveRole = isViewer ? "viewer" : role;
  const shareUrl = `${baseUrl}/board/${boardId}${effectiveRole === "viewer" ? "?role=viewer" : ""}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

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
          maxWidth: "480px",
          padding: "24px",
          boxShadow: isLight ? "0 20px 50px rgba(0, 0, 0, 0.12)" : "0 20px 50px rgba(0, 0, 0, 0.6)",
          color: isLight ? "#0f172a" : "#f3f4f6"
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Share Board"
        aria-modal="true"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "rgba(59, 130, 246, 0.2)", padding: "8px", borderRadius: "10px", color: "#3b82f6" }}>
              <Share2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: isLight ? "#0f172a" : "#ffffff" }}>
                Share Board
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: isLight ? "#475569" : "#9ca3af" }}>
                Collaborate in real time with anyone
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

        {/* Role Selection */}
        {isViewer ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#059669",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px"
            }}
          >
            <Eye size={16} />
            <span>You have View-Only access. You can only share View-Only links.</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <button
              onClick={() => setRole("editor")}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px",
                borderRadius: "10px",
                border: role === "editor" ? "1.5px solid #3b82f6" : isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.08)",
                background: role === "editor" ? "rgba(59, 130, 246, 0.15)" : isLight ? "#f8fafc" : "rgba(255,255,255,0.03)",
                color: role === "editor" ? "#2563eb" : isLight ? "#475569" : "#9ca3af",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <Edit3 size={15} />
              <span>Can Edit</span>
            </button>

            <button
              onClick={() => setRole("viewer")}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px",
                borderRadius: "10px",
                border: role === "viewer" ? "1.5px solid #10b981" : isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.08)",
                background: role === "viewer" ? "rgba(16, 185, 129, 0.15)" : isLight ? "#f8fafc" : "rgba(255,255,255,0.03)",
                color: role === "viewer" ? "#059669" : isLight ? "#475569" : "#9ca3af",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <Eye size={15} />
              <span>View Only</span>
            </button>
          </div>
        )}

        <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: isLight ? "#475569" : "#9ca3af", lineHeight: 1.5 }}>
          {role === "editor"
            ? "Anyone with this link can draw, edit, move elements, and trigger AI features."
            : "Viewers can observe live cursors and updates in real-time, but canvas edits are disabled."}
        </p>

        {/* Link Input & Copy Button */}
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            readOnly
            value={shareUrl}
            style={{
              flex: 1,
              background: isLight ? "#f1f5f9" : "rgba(0, 0, 0, 0.3)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              padding: "8px 12px",
              color: isLight ? "#0f172a" : "#e2e8f0",
              fontSize: "12px",
              outline: "none"
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: copied ? "#10b981" : "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s"
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
