"use client";

import { Canvas } from "@/components/Canvas/Canvas";
import { getCombinedBounds } from "@/components/Canvas/drawingUtils";
import { Toolbar } from "@/components/Toolbar";
import { Sidebar } from "@/components/Sidebar";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { deleteBoardRemote, getBoard, saveBoardChanges, claimBoard, renameBoard } from "@/lib/api";
import { clearToken, getToken, setToken, decodeRole, type BoardRole } from "@/lib/boardAuth";
import { clearLegacyTitle, readLegacyTitle, rememberRecentBoard, removeRecentBoard } from "@/lib/recentBoards";
import { useSocket } from "@/hooks/useSocket";
import { useBoardStore } from "@/store/boardStore";
import { use, useEffect, useState } from "react";
import type { PresenceUser, WhiteboardElement } from "@shared/types";
import { DEFAULT_BOARD_TITLE, MAX_BOARD_TITLE_LENGTH } from "@shared/types";
import { ShortcutsModal } from "@/components/Modals/ShortcutsModal";
import { ShareModal } from "@/components/Modals/ShareModal";
import { TemplatesModal } from "@/components/Modals/TemplatesModal";
import { AiDiagramModal } from "@/components/Modals/AiDiagramModal";
import { UserNameModal } from "@/components/Modals/UserNameModal";
import { ActiveUsersModal } from "@/components/Modals/ActiveUsersModal";
import { Minimap } from "@/components/Canvas/Minimap";
import { BoardLoadingScreen } from "@/components/Common/BoardLoadingScreen";
import { CanvasFlowLogo } from "@/components/Common/CanvasFlowLogo";
import {
  Undo2,
  Redo2,
  Plus,
  Minus,
  Eye,
  CheckCircle2,
  CloudOff,
  Scan,
  Loader2,
  Share2
} from "lucide-react";

type BoardPageProps = {
  params: Promise<{ id: string }>;
};

function fitBoardContent(elements: WhiteboardElement[]) {
  const bounds = getCombinedBounds(elements);
  if (!bounds) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const zoom = Math.min(1, Math.max(0.02, Math.min((width - 72) / bounds.width, (height - 200) / bounds.height)));
  useBoardStore.getState().setViewport({
    zoom,
    x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (height - bounds.height * zoom) / 2 - bounds.y * zoom
  });
}

export default function BoardPage({ params }: BoardPageProps) {
  const { id: boardId } = use(params);
  const resetViewport = useBoardStore((state) => state.resetViewport);
  const loadBoard = useBoardStore((state) => state.loadBoard);
  const restoreElements = useBoardStore((state) => state.restoreElements);
  const clearBoard = useBoardStore((state) => state.clearBoard);
  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const canUndo = useBoardStore((state) => state.history.length > 0);
  const canRedo = useBoardStore((state) => state.future.length > 0);
  const zoom = useBoardStore((state) => state.viewport.zoom);
  const setZoom = useBoardStore((state) => state.setZoom);
  const presenceUsers = useBoardStore((state) => state.presenceUsers);
  const currentUserId = useBoardStore((state) => state.currentUserId);
  const theme = useBoardStore((state) => state.theme);
  const setIsLocked = useBoardStore((state) => state.setIsLocked);

  const [loadedBoardId, setLoadedBoardId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isViewer, setIsViewer] = useState(false);
  const [boardRole, setBoardRole] = useState<BoardRole | null>(null);
  const [isUnauthenticated, setIsUnauthenticated] = useState(false);
  const [pastedLinkInput, setPastedLinkInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
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
  const [serverTitle, setServerTitle] = useState(DEFAULT_BOARD_TITLE);
  const [legacyTitle, setLegacyTitle] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const canManage = boardRole === "owner" && !isViewer;
  const boardTitle = serverTitle === DEFAULT_BOARD_TITLE && canManage ? legacyTitle ?? serverTitle : serverTitle;

  async function saveTitle(input: HTMLInputElement) {
    if (!canManage || isRenaming) return;
    if (input.dataset.cancelRename) {
      delete input.dataset.cancelRename;
      return;
    }
    const title = input.value.trim() || DEFAULT_BOARD_TITLE;
    input.value = title;
    if (title === serverTitle && !legacyTitle) return;
    setIsRenaming(true);
    setTitleError(null);
    try {
      const result = await renameBoard(boardId, title);
      clearLegacyTitle(boardId);
      setLegacyTitle(null);
      setServerTitle(result.title);
      rememberRecentBoard(boardId, result.title);
    } catch (error) {
      input.value = boardTitle;
      setTitleError("Could not save the board name. Try again.");
      if ((error as { status?: number })?.status === 401) setBoardRole(null);
    } finally {
      setIsRenaming(false);
    }
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = boardTitle === DEFAULT_BOARD_TITLE ? "Canvas Flow" : `${boardTitle} — Canvas Flow`;
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
      sessionStorage.setItem("whiteboard_user_name", stored);
      setCurrentUserName(stored);
    }

    // Check if URL has ?share=<token> and save it, stripping from address bar
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const shareToken = params.get("share");
      if (shareToken) {
        setToken(boardId, shareToken, false);
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("share");
        window.history.replaceState(window.history.state, "", cleanUrl.pathname + cleanUrl.search);
      }

      const activeToken = getToken(boardId);
      const activeRole = decodeRole(activeToken);
      if (activeRole === "viewer") {
        setIsViewer(true);
        setIsLocked(true);
      }
    }
  }, [boardId, setIsLocked]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isViewer || useBoardStore.getState().pendingLocalChanges.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isViewer]);

  const collaboration = useSocket(boardId, {
    enabled: loadedBoardId === boardId && !isUnauthenticated && !loadError,
    onTitleChange: (title) => {
      if (title === serverTitle) return;
      setServerTitle(title);
      rememberRecentBoard(boardId, title);
    },
    onJoinDenied: (code) => {
      if (code === "BOARD_NOT_FOUND") {
        removeRecentBoard(boardId);
        setLoadError("Board not found.");
        return;
      }
      setIsViewer(true);
      setIsLocked(true);
      setIsUnauthenticated(true);
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    setIsUnauthenticated(false);
    setSaveStatus("saved");
    setSaveError(null);
    setTitleError(null);
    setClearedElementsBackup(null);
    const load = async () => {
      try {
        let board = await getBoard(boardId, controller.signal);
        if (controller.signal.aborted) return;
        if (!getToken(boardId) && board.claimable) {
          try {
            board = (await claimBoard(boardId)).board;
          } catch (error: any) {
            if (error?.status === 409) {
              throw Object.assign(new Error("This board was just claimed."), { status: 401 });
            }
            throw error;
          }
        }
        if (!controller.signal.aborted) {
          const token = getToken(boardId);
          if (token) setToken(boardId, token);
          const role = decodeRole(token);
          const isReadOnly = role === "viewer";
          setBoardRole(role);
          setIsViewer(isReadOnly);
          setIsLocked(isReadOnly);
          loadBoard(board.elements, board.version, board.deletedElementIds);
          resetViewport();
          if (board.version === 0) fitBoardContent(board.elements);
          const title = board.title ?? DEFAULT_BOARD_TITLE;
          const localTitle = role === "owner" && title === DEFAULT_BOARD_TITLE ? readLegacyTitle(boardId) : null;
          setServerTitle(title);
          setLegacyTitle(localTitle);
          rememberRecentBoard(boardId, localTitle ?? title);
        }
      } catch (error: any) {
        if (controller.signal.aborted) return;
        loadBoard([]);
        if (error?.status === 401) {
          setIsViewer(true);
          setIsLocked(true);
          setIsUnauthenticated(true);
        } else {
          if (error?.status === 404) removeRecentBoard(boardId);
          setLoadError(error?.status === 404 ? "Board not found." : "Could not load the board.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadedBoardId(boardId);
      }
    };
    void load();
    return () => controller.abort();
  }, [boardId, loadAttempt, loadBoard, resetViewport, setIsLocked]);

  useEffect(() => {
    if (loadedBoardId !== boardId || isViewer || loadError) return;
    const controller = new AbortController();
    let saving = false;
    let retryAt = 0;
    let retryDelay = 1000;

    const save = async () => {
      const state = useBoardStore.getState();
      if (saving || Date.now() < retryAt || state.isLocked || state.pendingLocalChanges.size === 0) return;
      const changes = new Map(state.pendingLocalChanges);
      for (const id of state.activeElementIds) {
        if (changes.get(id)) changes.delete(id);
      }
      if (state.editingElementId) changes.delete(state.editingElementId);
      if (changes.size === 0) return;

      saving = true;
      setSaveStatus("saving");
      try {
        const result = await saveBoardChanges(boardId, changes, controller.signal);
        if (controller.signal.aborted) return;
        state.mergeRemoteElements(result.elements, result.deletedIds, result.version, "committed");
        state.acknowledgeLocalChanges(changes);
        retryDelay = 1000;
        setSaveStatus("saved");
        setSaveError(null);
      } catch (error: any) {
        if (controller.signal.aborted) return;
        if (error?.status === 401 || error?.status === 403) {
          setIsViewer(true);
          setIsLocked(true);
          setIsUnauthenticated(true);
        }
        retryAt = Date.now() + Math.max(retryDelay, error?.retryAfterMs ?? 0);
        retryDelay = Math.min(retryDelay * 2, 15000);
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "Auto-save failed.");
      } finally {
        saving = false;
      }
    };

    const interval = window.setInterval(save, 1000);
    const saveOnReconnect = () => {
      retryAt = 0;
      void save();
    };
    window.addEventListener("online", saveOnReconnect);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", saveOnReconnect);
    };
  }, [boardId, loadedBoardId, isViewer, loadError, setIsLocked]);

  const handleClear = () => {
    const prev = useBoardStore.getState().elements;
    if (!prev.length) return;
    setClearedElementsBackup(prev);
    clearBoard();
    collaboration.emitClear();
  };

  const handleDeleteBoard = async () => {
    try {
      await deleteBoardRemote(boardId);
      removeRecentBoard(boardId);
      clearLegacyTitle(boardId);
      clearToken(boardId);
      loadBoard([]);
      window.location.href = "/";
    } catch (error) {
      alert("Failed to delete board: " + (error instanceof Error ? error.message : "Network error"));
    }
  };

  const handleUndoClear = () => {
    if (clearedElementsBackup) {
      // The cleared ids are deleted for everyone, so the elements come back under new ids.
      const restored = restoreElements(clearedElementsBackup);
      if (restored) collaboration.emitReplace(restored);
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

  const handleApplyLink = (input: string) => {
    const clean = input.trim();
    if (!clean) return;
    let token = clean;
    if (clean.includes("share=")) {
      try {
        const parsed = new URL(clean, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
        token = parsed.searchParams.get("share") || clean;
      } catch {
        const match = clean.match(/[?&]share=([^&#]+)/);
        if (match) token = match[1];
      }
    }
    setToken(boardId, token, false);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  useKeyboardShortcuts({
    onClear: handleClear,
    onReplace: collaboration.emitReplace,
    onShowShortcuts: () => setIsShortcutsOpen(true)
  });

  if (loadedBoardId !== boardId && !loadError) {
    return <BoardLoadingScreen />;
  }

  if (loadError) {
    return (
      <BoardLoadingScreen
        error={loadError}
        onRetry={() => {
          setLoadedBoardId(null);
          setLoadError(null);
          setLoadAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  const titleEditor = (
    <input
      className="board-title-input"
      key={`${boardId}:${boardTitle}`}
      defaultValue={boardTitle}
      maxLength={MAX_BOARD_TITLE_LENGTH}
      readOnly={!canManage || isRenaming}
      title={canManage ? "Click to rename board" : "Board title"}
      aria-label="Board Title"
      onBlur={(event) => void saveTitle(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.dataset.cancelRename = "true";
          event.currentTarget.value = boardTitle;
          event.currentTarget.blur();
        }
      }}
    />
  );

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
          mobileTitleEditor={titleEditor}
          saveStatus={saveStatus}
          isViewer={isViewer}
          onClear={handleClear}
          onDeleteBoard={canManage ? handleDeleteBoard : undefined}
          onFit={() => fitBoardContent(useBoardStore.getState().elements)}
          onShowShortcuts={() => setIsShortcutsOpen(true)}
        />
        <div className="board-title-group" style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "2px" }}>
          <CanvasFlowLogo size={20} style={{ opacity: 0.9 }} />
          {titleEditor}
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
          {Math.round(zoom * 100)}%
        </button>
      </div>

      {/* Read-Only Banner */}
      {isViewer && (
        <div
          className="readonly-banner"
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
            gap: "10px",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: isUnauthenticated ? "#f59e0b" : "#10b981"
            }}
          />
          <span>
            {isUnauthenticated
              ? "Ask the board owner for a valid invite link."
              : "You have view-only access to this board."}
          </span>
          {isUnauthenticated && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyLink(pastedLinkInput);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "4px" }}
            >
              <input
                type="text"
                placeholder="Have a link?"
                value={pastedLinkInput}
                onChange={(e) => setPastedLinkInput(e.target.value)}
                aria-label="Have a link?"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "11px",
                  padding: "2px 8px",
                  width: "110px",
                  outline: "none"
                }}
              />
              <button
                type="submit"
                style={{
                  background: "#6366f1",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  cursor: "pointer"
                }}
              >
                Unlock
              </button>
            </form>
          )}
        </div>
      )}

      {/* Toolbar & Properties */}
      <Toolbar
        collaboration={collaboration}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenAiDiagram={() => setIsAiDiagramOpen(true)}
        isViewer={isViewer}
      />
      {!isViewer && <PropertiesPanel collaboration={collaboration} />}

      {/* Top-Right Collaboration & Share Bar */}
      <div className="top-presence-bar">
        {/* Collaborators Avatar Stack (Figma / Canva style) */}
        {(() => {
          const effectiveSelfId = currentUserId;

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
            onClick={() => setZoom(zoom * 0.9)}
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
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="control-button"
            onClick={() => setZoom(zoom * 1.1)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>

          <button className="control-button" onClick={() => fitBoardContent(useBoardStore.getState().elements)}
            title="Fit board to screen" aria-label="Fit board to screen">
            <Scan size={15} />
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

      {saveError || titleError ? <div className="status-banner" role="alert">{saveError || titleError}</div> : null}
    </main>
  );
}
