"use client";

import { Canvas } from "@/components/Canvas/Canvas";
import { Toolbar } from "@/components/Toolbar";
import { Sidebar } from "@/components/Sidebar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { clearBoardRemote, getBoard, saveBoard } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { useBoardStore } from "@/store/boardStore";
import { useEffect, useRef, useState } from "react";
import type { WhiteboardElement } from "@shared/types";
import { ShortcutsModal } from "@/components/Modals/ShortcutsModal";
import { ShareModal } from "@/components/Modals/ShareModal";
import { TemplatesModal } from "@/components/Modals/TemplatesModal";
import { AiDiagramModal } from "@/components/Modals/AiDiagramModal";
import { UserNameModal } from "@/components/Modals/UserNameModal";
import { ActiveUsersModal } from "@/components/Modals/ActiveUsersModal";
import { Minimap } from "@/components/Canvas/Minimap";
import {
  Undo2,
  Redo2,
  Plus,
  Minus,
  Eye,
  CheckCircle2,
  CloudOff,
  Loader2,
  Share2
} from "lucide-react";

type BoardPageProps = {
  params: {
    id: string;
  };
};

export default function BoardPage({ params }: BoardPageProps) {
  const boardId = params.id;
  const elements = useBoardStore((state) => state.elements);
  const version = useBoardStore((state) => state.version);
  const setVersion = useBoardStore((state) => state.setVersion);
  const loadBoard = useBoardStore((state) => state.loadBoard);
  const commitElements = useBoardStore((state) => state.commitElements);
  const clearBoard = useBoardStore((state) => state.clearBoard);
  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const canUndo = useBoardStore((state) => state.history.length > 0);
  const canRedo = useBoardStore((state) => state.future.length > 0);
  const viewport = useBoardStore((state) => state.viewport);
  const setZoom = useBoardStore((state) => state.setZoom);
  const presenceUsers = useBoardStore((state) => state.presenceUsers);
  const theme = useBoardStore((state) => state.theme);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);

  const [isLoading, setIsLoading] = useState(true);
  const [isViewer, setIsViewer] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "conflict" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearedElementsBackup, setClearedElementsBackup] = useState<WhiteboardElement[] | null>(null);

  // Modal visibility states
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isAiDiagramOpen, setIsAiDiagramOpen] = useState(false);
  const [isUserNameModalOpen, setIsUserNameModalOpen] = useState(false);
  const [isActiveUsersOpen, setIsActiveUsersOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("whiteboard_user_name");
    if (!stored) {
      setIsUserNameModalOpen(true);
    } else {
      setCurrentUserName(stored);
    }
  }, []);

  const lastSavedSnapshot = useRef("");
  const latestElementsRef = useRef(elements);
  const latestVersionRef = useRef(version);

  const collaboration = useSocket(boardId);

  useEffect(() => {
    latestElementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    latestVersionRef.current = version;
  }, [version]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const board = await getBoard(boardId);
        if (!cancelled) {
          loadBoard(board.elements, board.version || 0);
          lastSavedSnapshot.current = JSON.stringify(board.elements);
        }
      } catch (error) {
        if (!cancelled) {
          loadBoard([], 0);
          console.warn("Could not fetch remote board state, initialized empty canvas:", error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [boardId, loadBoard]);

  // A2.2: Version-aware autosave with conflict resolution
  useEffect(() => {
    const interval = window.setInterval(async () => {
      const snapshot = JSON.stringify(latestElementsRef.current);
      if (snapshot === lastSavedSnapshot.current) return;

      try {
        setSaveStatus("saving");
        const updated = await saveBoard(
          boardId,
          latestElementsRef.current,
          latestVersionRef.current
        );
        lastSavedSnapshot.current = snapshot;
        setVersion(updated.version);
        setSaveStatus("saved");
        setSaveError(null);
      } catch (error: any) {
        if (error?.status === 409) {
          // Version conflict: smart union merge so newly drawn lines and text are NEVER wiped out
          setSaveStatus("conflict");
          try {
            const fresh = await getBoard(boardId);
            const currentLocal = latestElementsRef.current;
            const remoteMap = new Map(fresh.elements.map((el) => [el.id, el]));

            // Keep all remote elements, plus any local elements created by this user not yet on the server
            const merged = [
              ...fresh.elements,
              ...currentLocal.filter((el) => !remoteMap.has(el.id))
            ];

            loadBoard(merged);
            latestElementsRef.current = merged;
            lastSavedSnapshot.current = JSON.stringify(merged);
            setVersion(fresh.version);

            // Re-save merged state with fresh.version
            const updated = await saveBoard(boardId, merged, fresh.version);
            setVersion(updated.version);
            setSaveStatus("saved");
            setSaveError(null);
          } catch {
            setSaveStatus("error");
          }
        } else {
          setSaveStatus("error");
          setSaveError(error instanceof Error ? error.message : "Auto-save failed.");
        }
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [boardId, loadBoard, setVersion]);

  // A1.4: Confirm before destructive action + Undo Toast
  const handleClear = async () => {
    const prev = [...elements];
    setClearedElementsBackup(prev);
    clearBoard();
    collaboration.emitClear();
    try {
      await clearBoardRemote(boardId);
      lastSavedSnapshot.current = JSON.stringify([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to clear.");
    }
  };

  const handleUndoClear = () => {
    if (clearedElementsBackup) {
      commitElements(clearedElementsBackup);
      collaboration.emitReplace(clearedElementsBackup);
      setClearedElementsBackup(null);
    }
  };

  // A2.1: Broadcast undo/redo across collaboration
  const handleUndo = () => {
    const nextElements = undo();
    if (nextElements) {
      collaboration.emitReplace(nextElements);
    }
  };

  const handleRedo = () => {
    const nextElements = redo();
    if (nextElements) {
      collaboration.emitReplace(nextElements);
    }
  };

  // F2.1: Viewer role check (?role=viewer or remembered in session)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const sessionRole = sessionStorage.getItem(`board_role_${boardId}`);
      if (sp.get("role") === "viewer" || sessionRole === "viewer") {
        sessionStorage.setItem(`board_role_${boardId}`, "viewer");
        setIsViewer(true);
        setIsLocked(true);
      }
    }
  }, [boardId, setIsLocked]);

  useKeyboardShortcuts({
    onClear: handleClear,
    onReplace: collaboration.emitReplace,
    onShowShortcuts: () => setIsShortcutsOpen(true)
  });

  if (isLoading) {
    return <main className="status-shell">Loading board...</main>;
  }

  return (
    <main
      className="board-shell"
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        background: "#0c0d14",
        margin: 0,
        padding: 0
      }}
    >
      {/* Top Navigation: Left Header */}
      <div className="top-left-nav">
        <Sidebar
          boardId={boardId}
          onClear={handleClear}
          onShowShortcuts={() => setIsShortcutsOpen(true)}
        />
        <div className="board-title-pill">
          <span className="board-title-text">Whiteboard</span>
          {isViewer && (
            <span className="viewer-badge">Viewer</span>
          )}
          <div className="save-status-indicator">
            {saveStatus === "saving" && <Loader2 size={12} className="animate-spin" color="#60a5fa" />}
            {saveStatus === "saved" && <CheckCircle2 size={12} color="#10b981" />}
            {saveStatus === "conflict" && <Loader2 size={12} color="#f59e0b" />}
            {saveStatus === "error" && <CloudOff size={12} color="#ef4444" />}
            <span className="save-status-text">{saveStatus}</span>
          </div>
        </div>
      </div>

      <Toolbar
        collaboration={collaboration}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenAiDiagram={() => setIsAiDiagramOpen(true)}
      />

      {/* Top-Right Collaboration & Share Bar */}
      <div className="top-presence-bar">
        {/* Collaborators Avatar Stack (Figma / Canva style) */}
        <div
          style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: "6px" }}
          onClick={() => setIsActiveUsersOpen(!isActiveUsersOpen)}
          title="Click to see active collaborators"
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {presenceUsers.slice(0, 5).map((user, idx) => {
              const initials = user.name
                ? user.name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                : "U";
              return (
                <div
                  key={user.userId}
                  title={user.name}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    backgroundColor: user.color || "#6366f1",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: theme === "light" ? "2px solid #ffffff" : "2px solid #181824",
                    marginLeft: idx === 0 ? 0 : "-8px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                    transition: "transform 0.15s ease",
                    zIndex: 10 - idx
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px) scale(1.12)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
                >
                  {initials}
                </div>
              );
            })}
          </div>

          {/* Active online count badge */}
          <div className="presence-count-pill">
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                boxShadow: "0 0 8px #10b981"
              }}
            />
            <span>{presenceUsers.length || 1} online</span>
          </div>
        </div>

        {/* F2.1: Share button */}
        <button
          onClick={() => setIsShareOpen(true)}
          title="Share Board"
          aria-label="Share Board Link"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            color: "#ffffff",
            border: "none",
            borderRadius: "9999px",
            padding: "5px 12px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)"
          }}
        >
          <Share2 size={13} />
          <span>Share</span>
        </button>
      </div>

      {/* Main Workspace Area */}
      <div className="workspace-shell">
        <Canvas collaboration={collaboration} />
      </div>

      {/* Bottom Controls */}
      <div className="bottom-left-controls">
        <div className="control-group">
          <button
            className="control-button"
            onClick={() => setZoom(viewport.zoom * 0.9)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <div className="zoom-display">{Math.round(viewport.zoom * 100)}%</div>
          <button
            className="control-button"
            onClick={() => setZoom(viewport.zoom * 1.1)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="control-group">
          <button
            className="control-button"
            onClick={handleUndo}
            disabled={!canUndo}
            style={{ opacity: canUndo ? 1 : 0.4 }}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="control-button"
            onClick={handleRedo}
            disabled={!canRedo}
            style={{ opacity: canRedo ? 1 : 0.4 }}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      {/* F5.2: Canvas Minimap */}
      <Minimap />

      {/* Modals */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} boardId={boardId} isViewer={isViewer} />
      <TemplatesModal isOpen={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} collaboration={collaboration} />
      <AiDiagramModal isOpen={isAiDiagramOpen} onClose={() => setIsAiDiagramOpen(false)} collaboration={collaboration} />
      <UserNameModal
        isOpen={isUserNameModalOpen}
        initialName={currentUserName}
        onSave={(name) => {
          setCurrentUserName(name);
          collaboration.emitUpdateUserName(name);
        }}
        onClose={() => setIsUserNameModalOpen(false)}
      />
      <ActiveUsersModal
        isOpen={isActiveUsersOpen}
        onClose={() => setIsActiveUsersOpen(false)}
        presenceUsers={presenceUsers}
        currentUserName={currentUserName}
      />

      {/* A1.4: Board cleared undo toast */}
      {clearedElementsBackup && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "#1f2937",
            border: "1px solid #374151",
            padding: "10px 18px",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            color: "#f3f4f6",
            fontSize: "13px"
          }}
        >
          <span>Board cleared.</span>
          <button
            onClick={handleUndoClear}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "4px 10px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Undo
          </button>
          <button
            onClick={() => setClearedElementsBackup(null)}
            style={{
              background: "transparent",
              color: "#9ca3af",
              border: "none",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {saveError ? <div className="status-banner" role="alert">{saveError}</div> : null}
    </main>
  );
}
