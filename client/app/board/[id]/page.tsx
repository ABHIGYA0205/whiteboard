"use client";

import { Canvas } from "@/components/Canvas/Canvas";
import { Toolbar } from "@/components/Toolbar";
import { Sidebar } from "@/components/Sidebar";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { clearBoardRemote, deleteBoardRemote, getBoard, saveBoard } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { useBoardStore } from "@/store/boardStore";
import { useEffect, useRef, useState } from "react";
import type { PresenceUser, WhiteboardElement } from "@shared/types";
import { ShortcutsModal } from "@/components/Modals/ShortcutsModal";
import { ShareModal } from "@/components/Modals/ShareModal";
import { TemplatesModal } from "@/components/Modals/TemplatesModal";
import { AiDiagramModal } from "@/components/Modals/AiDiagramModal";
import { UserNameModal } from "@/components/Modals/UserNameModal";
import { ActiveUsersModal } from "@/components/Modals/ActiveUsersModal";
import { Minimap } from "@/components/Canvas/Minimap";
import { CanvasFlowLogo } from "@/components/Common/CanvasFlowLogo";
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
  const resetViewport = useBoardStore((state) => state.resetViewport);
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
  const remoteCursors = useBoardStore((state) => state.remoteCursors);
  const currentUserId = useBoardStore((state) => state.currentUserId);
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
  const [boardTitle, setBoardTitle] = useState("Untitled Board");

  const handleTitleChange = (newTitle: string) => {
    setBoardTitle(newTitle);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`whiteboard_title_${boardId}`, newTitle);
        const stored = localStorage.getItem("whiteboard_recent_boards");
        let boards = stored ? JSON.parse(stored) : [];
        let found = false;
        boards = boards.map((b: any) => {
          if (b.id === boardId) {
            found = true;
            return { ...b, title: newTitle };
          }
          return b;
        });
        if (!found) {
          boards.unshift({ id: boardId, title: newTitle, visitedAt: Date.now() });
        }
        localStorage.setItem("whiteboard_recent_boards", JSON.stringify(boards.slice(0, 10)));
      } catch {}
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = boardTitle && boardTitle !== "Untitled Board" ? `${boardTitle} — Canvas Flow` : "Canvas Flow";
    }
  }, [boardTitle]);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (sessionStorage.getItem("whiteboard_user_name") || localStorage.getItem("whiteboard_user_name"))
        : null;
    if (!stored) {
      setIsUserNameModalOpen(true);
    } else {
      setCurrentUserName(stored);
    }

    // P1-1: Check if link is view-only (?role=viewer)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("role") === "viewer") {
        setIsViewer(true);
        setIsLocked(true);
      }
    }
  }, [setIsLocked]);

  // P1-6: Track recent boards in localStorage so user can always find them
  useEffect(() => {
    if (typeof window !== "undefined" && boardId) {
      try {
        const stored = localStorage.getItem("whiteboard_recent_boards");
        const list: Array<{ id: string; visitedAt: number }> = stored ? JSON.parse(stored) : [];
        const filtered = list.filter((b) => b.id !== boardId);
        const updated = [{ id: boardId, visitedAt: Date.now() }, ...filtered].slice(0, 10);
        localStorage.setItem("whiteboard_recent_boards", JSON.stringify(updated));
      } catch {}
    }
  }, [boardId]);

  // P2-13: Unsaved work guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isViewer) return;
      if (
        saveStatus === "saving" ||
        (lastSavedSnapshot.current && JSON.stringify(latestElementsRef.current) !== lastSavedSnapshot.current)
      ) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isViewer, saveStatus]);

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
          const savedTitle =
            board.title ||
            (typeof window !== "undefined" ? localStorage.getItem(`whiteboard_title_${boardId}`) : "") ||
            "Untitled Board";
          setBoardTitle(savedTitle);
          if (typeof document !== "undefined") {
            document.title = savedTitle && savedTitle !== "Untitled Board" ? `${savedTitle} — Canvas Flow` : "Canvas Flow";
          }
          try {
            const stored = localStorage.getItem("whiteboard_recent_boards");
            let boards = stored ? JSON.parse(stored) : [];
            boards = boards.filter((b: any) => b.id !== boardId);
            boards.unshift({ id: boardId, title: savedTitle, visitedAt: Date.now() });
            localStorage.setItem("whiteboard_recent_boards", JSON.stringify(boards.slice(0, 10)));
          } catch {}
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

  // A2.2: Version-aware autosave with conflict resolution (disabled for viewers)
  useEffect(() => {
    if (isViewer) return;
    const interval = window.setInterval(async () => {
      const snapshot = JSON.stringify(latestElementsRef.current);
      if (snapshot === lastSavedSnapshot.current) return;

      try {
        setSaveStatus("saving");
        const updated = await saveBoard(
          boardId,
          latestElementsRef.current,
          latestVersionRef.current,
          Array.from(useBoardStore.getState().deletedElementIds)
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
            const { deletedElementIds } = useBoardStore.getState();

            // Union merge: server state first (authoritative order), then every
            // local element the server has not seen yet. The old version also
            // filtered out anything that had ever been saved before, which
            // permanently deleted your work whenever a peer's save won the race.
            const mergedRemoteIds = new Set(fresh.elements.map((el) => el.id));
            const merged = [
              ...fresh.elements.filter((el) => !deletedElementIds.has(el.id)),
              ...currentLocal.filter(
                (el) => !mergedRemoteIds.has(el.id) && !deletedElementIds.has(el.id)
              )
            ];

            loadBoard(merged);
            latestElementsRef.current = merged;
            lastSavedSnapshot.current = JSON.stringify(merged);
            setVersion(fresh.version);

            // Re-save merged state with fresh.version
            const updated = await saveBoard(
              boardId,
              merged,
              fresh.version,
              Array.from(deletedElementIds)
            );
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

  const handleDeleteBoard = async () => {
    try {
      collaboration.emitDeleteBoard();
      await deleteBoardRemote(boardId);
      try {
        const stored = localStorage.getItem("whiteboard_recent_boards");
        if (stored) {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter((b: any) => b.id !== boardId);
          localStorage.setItem("whiteboard_recent_boards", JSON.stringify(filtered));
        }
      } catch {}
      window.location.href = "/";
    } catch (error) {
      alert("Failed to delete board: " + (error instanceof Error ? error.message : "Network error"));
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
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0c0d14",
        margin: 0,
        padding: 0
      }}
    >
      {/* Top-Left: Minimal hamburger menu + board title + mobile undo/redo */}
      <div className="top-left-nav">
        <Sidebar
          boardId={boardId}
          boardTitle={boardTitle}
          saveStatus={saveStatus}
          isViewer={isViewer}
          onClear={handleClear}
          onDeleteBoard={handleDeleteBoard}
          onShowShortcuts={() => setIsShortcutsOpen(true)}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "2px" }}>
          <CanvasFlowLogo size={20} style={{ opacity: 0.9 }} />
          <input
            value={boardTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={isViewer}
            title={isViewer ? "Board title (read-only)" : "Click to rename board"}
            aria-label="Board Title"
            style={{
              background: "transparent",
              border: "none",
              color: theme === "light" ? "#0f172a" : "#f8fafc",
              fontWeight: 700,
              fontSize: "13px",
              padding: "4px 8px",
              borderRadius: "6px",
              maxWidth: "160px",
              outline: "none",
              cursor: isViewer ? "default" : "text",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
            onFocus={(e) => {
              if (!isViewer) {
                e.target.style.background = theme === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)";
              }
            }}
            onBlur={(e) => {
              e.target.style.background = "transparent";
            }}
          />
        </div>
        <div className="mobile-header-actions">
          <button
            className="mobile-header-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            style={{ opacity: canUndo ? 1 : 0.35 }}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="mobile-header-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            style={{ opacity: canRedo ? 1 : 0.35 }}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      {/* Mobile Center: Quick Zoom indicator & 100% reset */}
      <div className="mobile-center-nav">
        <button
          className="mobile-zoom-pill"
          onClick={() => resetViewport()}
          title="Reset zoom to 100%"
          aria-label="Reset zoom"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
      </div>

      {/* Center Tool Area: Hidden/Read-Only in Viewer Mode */}
      {isViewer ? (
        <div
          style={{
            position: "fixed",
            top: "14px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(18, 19, 31, 0.95)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            padding: "6px 16px",
            borderRadius: "9999px",
            color: "#94a3b8",
            fontSize: "12px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
          }}
        >
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
          <span>Viewing board #{boardId.slice(0, 8)} (Read-only)</span>
        </div>
      ) : (
        <>
          <Toolbar
            collaboration={collaboration}
            onOpenTemplates={() => setIsTemplatesOpen(true)}
            onOpenAiDiagram={() => setIsAiDiagramOpen(true)}
          />
          <PropertiesPanel collaboration={collaboration} />
        </>
      )}

      {/* Top-Right Collaboration & Share Bar */}
      <div className="top-presence-bar">
        {/* Collaborators Avatar Stack (Figma / Canva style) */}
        {(() => {
          const effectiveSelfId =
            currentUserId ||
            (typeof window !== "undefined" ? sessionStorage.getItem("whiteboard_user_id") : null);

          const userMap = new Map<string, PresenceUser>();

          // Collect all reported presence users
          for (const u of presenceUsers) {
            if (u && u.userId) {
              const isSelf = Boolean(effectiveSelfId) && u.userId === effectiveSelfId;
              userMap.set(u.userId, {
                userId: u.userId,
                name: isSelf && currentUserName ? currentUserName : (u.name || `User-${u.userId.slice(0, 4)}`),
                color: u.color || "#6366f1"
              });
            }
          }

          // Also incorporate any active live cursors seen on canvas
          const now = Date.now();
          for (const cursor of Object.values(remoteCursors)) {
            if (cursor && cursor.userId && !userMap.has(cursor.userId)) {
              if (now - (cursor.lastSeen || 0) < 3500) {
                const isSelf = Boolean(effectiveSelfId) && cursor.userId === effectiveSelfId;
                userMap.set(cursor.userId, {
                  userId: cursor.userId,
                  name: isSelf && currentUserName ? currentUserName : (cursor.name || `User-${cursor.userId.slice(0, 4)}`),
                  color: cursor.color || "#3b82f6"
                });
              }
            }
          }

          // Always ensure the local self user is present
          if (effectiveSelfId && !userMap.has(effectiveSelfId)) {
            userMap.set(effectiveSelfId, {
              userId: effectiveSelfId,
              name: currentUserName || "You",
              color: "#6366f1"
            });
          }

          const allUsers = Array.from(userMap.values());
          // Pin self user first, then collaborators
          const selfUser = allUsers.find((u) => u.userId === effectiveSelfId);
          const otherUsers = allUsers.filter((u) => u.userId !== effectiveSelfId);
          const effectivePresenceUsers = selfUser ? [selfUser, ...otherUsers] : allUsers;

          return (
            <div
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: "6px" }}
              onClick={() => setIsActiveUsersOpen(!isActiveUsersOpen)}
              title="Click to see active collaborators"
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {effectivePresenceUsers.slice(0, 5).map((user, idx) => {
                  const initials = user.name
                    ? user.name.split(/\s+/).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                    : "U";
                  return (
                    <div
                      key={user.userId || idx}
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
                {effectivePresenceUsers.length > 5 && (
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: "#374151",
                      color: "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                      fontWeight: 700,
                      border: theme === "light" ? "2px solid #ffffff" : "2px solid #181824",
                      marginLeft: "-8px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                      zIndex: 4
                    }}
                    title={`${effectivePresenceUsers.length - 5} more collaborators`}
                  >
                    +{effectivePresenceUsers.length - 5}
                  </div>
                )}
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
                <span className="presence-count-text">
                  {effectivePresenceUsers.length} {effectivePresenceUsers.length === 1 ? "online" : "collaborating"}
                </span>
              </div>
            </div>
          );
        })()}

        {/* F2.1: Share button */}
        <button
          onClick={() => setIsShareOpen(true)}
          title="Share Board"
          aria-label="Share Board Link"
          className="share-header-button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "#6366f1",
            color: "#ffffff",
            border: "none",
            borderRadius: "9999px",
            padding: "5px 12px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.4)"
          }}
        >
          <Share2 size={13} />
          <span className="share-btn-text">Share</span>
        </button>
      </div>

      {/* Main Workspace Area */}
      <div className="workspace-shell">
        <Canvas collaboration={collaboration} />
      </div>

      {/* Bottom Controls: Unified single horizontal line for Zoom and Undo/Redo */}
      <div className="bottom-left-controls">
        <div className="control-group unified-controls">
          <button
            className="control-button"
            onClick={() => setZoom(viewport.zoom * 0.9)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <button
            className="zoom-display-btn"
            onClick={() => resetViewport()}
            title="Reset zoom to 100%"
            aria-label="Reset zoom"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            className="control-button"
            onClick={() => setZoom(viewport.zoom * 1.1)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>

          <div className="controls-separator" />

          <button
            className="control-button"
            onClick={handleUndo}
            disabled={!canUndo}
            style={{ opacity: canUndo ? 1 : 0.35 }}
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button
            className="control-button"
            onClick={handleRedo}
            disabled={!canRedo}
            style={{ opacity: canRedo ? 1 : 0.35 }}
            title="Redo (Cmd/Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={15} />
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
        onOpenUserNameModal={() => setIsUserNameModalOpen(true)}
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
