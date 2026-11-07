"use client";

import { useState, useEffect } from "react";
import { X, Share2, Copy, Check, Eye, Edit3, AlertCircle } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import { getToken, decodeRole } from "@/lib/boardAuth";
import { createShareLink } from "@/lib/api";

type ShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  isViewer?: boolean;
};

export function ShareModal({ isOpen, onClose, boardId, isViewer = false }: ShareModalProps) {
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  const [copiedType, setCopiedType] = useState<"viewer" | "editor" | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string>("");
  const [editorUrl, setEditorUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = getToken(boardId);
  const userRole = decodeRole(token);
  const isOwner = userRole === "owner";
  const isEditor = userRole === "editor";
  const cannotShare = isViewer || userRole === "viewer" || (!isOwner && !isEditor);

  useEffect(() => {
    if (!isOpen || cannotShare) return;

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const loadLinks = async () => {
      try {
        if (isOwner) {
          const [viewerRes, editorRes] = await Promise.all([
            createShareLink(boardId, "viewer"),
            createShareLink(boardId, "editor")
          ]);
          if (!cancelled) {
            setViewerUrl(viewerRes.url);
            setEditorUrl(editorRes.url);
          }
        } else if (isEditor) {
          const viewerRes = await createShareLink(boardId, "viewer");
          if (!cancelled) {
            setViewerUrl(viewerRes.url);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMessage("Failed to generate share links. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadLinks();

    return () => {
      cancelled = true;
    };
  }, [isOpen, boardId, isOwner, isEditor, cannotShare]);

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

  const handleCopy = (url: string, type: "viewer" | "editor") => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedType(null);
    }, 2500);
  };

  const maskUrl = (fullUrl: string) => {
    if (!fullUrl) return "";
    try {
      const parsed = new URL(fullUrl);
      const share = parsed.searchParams.get("share");
      if (share && share.length > 12) {
        return `${parsed.origin}${parsed.pathname}?share=${share.slice(0, 6)}...${share.slice(-4)}`;
      }
      return `${parsed.origin}${parsed.pathname}?share=...`;
    } catch {
      return fullUrl.slice(0, 32) + "...";
    }
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
                Collaborate in real time with signed links
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
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {cannotShare ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "12px",
              background: isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              color: isLight ? "#b91c1c" : "#f87171",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <AlertCircle size={18} />
            <span>Viewers cannot share this board. Ask the owner for an invite link.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {errorMessage && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
                  fontSize: "12px"
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* Viewer Link Option */}
            <div
              style={{
                background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.03)",
                border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "14px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Eye size={16} style={{ color: "#10b981" }} />
                  <span style={{ fontWeight: 600, fontSize: "14px", color: isLight ? "#0f172a" : "#f8fafc" }}>
                    Viewer Link
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: isLight ? "#64748b" : "#94a3b8" }}>
                  expires in 7 days
                </span>
              </div>
              <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: isLight ? "#64748b" : "#94a3b8" }}>
                Read-only access. Collaborators can view and pan, but cannot modify canvas elements.
              </p>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  readOnly
                  value={isLoading ? "Generating link..." : maskUrl(viewerUrl)}
                  style={{
                    flex: 1,
                    background: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.3)",
                    border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    color: isLight ? "#334155" : "#cbd5e1",
                    outline: "none"
                  }}
                />
                <button
                  onClick={() => handleCopy(viewerUrl, "viewer")}
                  disabled={isLoading || !viewerUrl}
                  style={{
                    background: copiedType === "viewer" ? "#10b981" : "#3b82f6",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: isLoading || !viewerUrl ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease"
                  }}
                >
                  {copiedType === "viewer" ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedType === "viewer" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            {/* Editor Link Option */}
            {isOwner ? (
              <div
                style={{
                  background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.03)",
                  border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "14px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Edit3 size={16} style={{ color: "#3b82f6" }} />
                    <span style={{ fontWeight: 600, fontSize: "14px", color: isLight ? "#0f172a" : "#f8fafc" }}>
                      Editor Link
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: isLight ? "#64748b" : "#94a3b8" }}>
                    expires in 7 days
                  </span>
                </div>
                <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: isLight ? "#64748b" : "#94a3b8" }}>
                  Full edit access. Collaborators can draw, edit, move shapes, and auto-save.
                </p>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    readOnly
                    value={isLoading ? "Generating link..." : maskUrl(editorUrl)}
                    style={{
                      flex: 1,
                      background: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.3)",
                      border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "12px",
                      color: isLight ? "#334155" : "#cbd5e1",
                      outline: "none"
                    }}
                  />
                  <button
                    onClick={() => handleCopy(editorUrl, "editor")}
                    disabled={isLoading || !editorUrl}
                    style={{
                      background: copiedType === "editor" ? "#10b981" : "#3b82f6",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: isLoading || !editorUrl ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {copiedType === "editor" ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedType === "editor" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.06)",
                  color: isLight ? "#64748b" : "#94a3b8",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <Edit3 size={15} style={{ opacity: 0.6 }} />
                <span>Only the board owner can create editor links.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
