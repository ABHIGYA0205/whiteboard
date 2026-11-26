"use client";

import { useState, useEffect, useRef } from "react";
import {
  Menu,
  X,
  FolderOpen,
  Save,
  Download,
  HelpCircle,
  RotateCcw,
  Sun,
  Moon,
  Globe,
  FileCode,
  Keyboard,
  CheckCircle2,
  CloudOff,
  Loader2,
  Clock,
  Trash2,
  Scan
} from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import { CanvasFlowLogo } from "@/components/Common/CanvasFlowLogo";
import { exportToSvg, exportSelectionToImage } from "@/components/Canvas/drawingUtils";

import { createBoard } from "@/lib/api";
import { readBoardSnapshot } from "@/lib/boardSnapshot";
import { clearRecentBoards, readRecentBoards, rememberRecentBoard, removeRecentBoard, type RecentBoard } from "@/lib/recentBoards";

type SidebarProps = {
  boardId: string;
  saveStatus?: "saved" | "saving" | "conflict" | "error";
  isViewer?: boolean;
  boardTitle?: string;
  mobileTitleEditor: React.ReactNode;
  onClear: () => void;
  onFit: () => void;
  onDeleteBoard?: () => void;
  onShowShortcuts?: () => void;
};

export function Sidebar({ boardId, boardTitle, mobileTitleEditor, saveStatus, isViewer, onClear, onFit, onDeleteBoard, onShowShortcuts }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useBoardStore((state) => state.theme);
  const setTheme = useBoardStore((state) => state.setTheme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const elements = useBoardStore((state) => state.elements);
  const [recentBoards, setRecentBoards] = useState<RecentBoard[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setRecentBoards(readRecentBoards());
  }, [isOpen]);

  // Close menu on click/touch outside on the board
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // A6.5: Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileOpen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isImporting) return;

    setImportError(null);
    setIsImporting(true);
    try {
      const snapshot = await readBoardSnapshot(file);
      const board = await createBoard(undefined, snapshot);
      rememberRecentBoard(board.id, board.title ?? snapshot.title);
      window.location.assign(`/board/${encodeURIComponent(board.id)}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import the board.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveTo = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(elements, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `whiteboard-${boardId.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setIsOpen(false);
  };

  // P2-1: Export content bounds without UI chrome
  const handleExport = () => {
    setIsOpen(false);
    const bg = theme === "dark" ? "#010409" : "#f8fafc";
    const dataUrl = exportSelectionToImage(elements, bg);
    if (dataUrl) {
      const link = document.createElement("a");
      link.download = `whiteboard-${boardId.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
      return;
    }

    // Fallback if empty canvas
    const canvas = document.querySelector(".board-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    const link = document.createElement("a");
    link.download = `whiteboard-${boardId.slice(0, 8)}.png`;
    link.href = tempCanvas.toDataURL("image/png");
    link.click();
  };

  // F1.11: Vector SVG Export
  const handleExportSvg = () => {
    const bg = theme === "dark" ? "#010409" : "#ffffff";
    const svgStr = exportToSvg(elements, bg);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `whiteboard-${boardId.slice(0, 8)}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="sidebar-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Open menu"
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 998,
            background: "transparent"
          }}
        />
      )}

      {isOpen && (
        <div
          className="sidebar-panel open"
          ref={panelRef}
          role="dialog"
          aria-label="Board settings and file menu"
          aria-modal={isOpen}
          style={{ zIndex: 1000 }}
        >
          <div className="sidebar-heading">
            <div className="sidebar-heading-info">
              <CanvasFlowLogo size={24} />
              <div>
                <div className="sidebar-board-title">{boardTitle || "Canvas Flow"}</div>
                <div className="sidebar-board-title-editor">{mobileTitleEditor}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>#{boardId.slice(0, 8)}</div>
              </div>
            </div>
            {saveStatus && (
              <div className="sidebar-save-status">
                {saveStatus === "saving" && <Loader2 size={12} className="animate-spin" color="#60a5fa" />}
                {saveStatus === "saved" && <CheckCircle2 size={12} color="#10b981" />}
                {saveStatus === "conflict" && <Loader2 size={12} color="#f59e0b" />}
                {saveStatus === "error" && <CloudOff size={12} color="#ef4444" />}
                <span style={{ textTransform: "capitalize" }}>{saveStatus}</span>
                {isViewer && (
                  <span
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#34d399",
                      border: "1px solid #10b981",
                      borderRadius: "9999px",
                      padding: "1px 6px",
                      fontSize: "9px",
                      fontWeight: 700,
                      marginLeft: "4px"
                    }}
                  >
                    Viewer
                  </span>
                )}
              </div>
            )}
          </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".json" 
          onChange={handleFileOpen} 
        />
        <button className="menu-item" onClick={handleOpenClick} aria-label="Open board file" disabled={isImporting}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderOpen size={16} />
            <span>{isImporting ? "Importing…" : "Import into new board"}</span>
          </div>
        </button>
        {importError && <p className="menu-item" role="alert">{importError}</p>}
        <button className="menu-item" onClick={handleSaveTo} aria-label="Save board to JSON file">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Save size={16} />
            <span>Save to...</span>
          </div>
        </button>
        <button className="menu-item" onClick={handleExport} aria-label="Export canvas to PNG image">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Download size={16} />
            <span>Export image...</span>
          </div>
          <span className="menu-item-shortcut">Cmd+Shift+E</span>
        </button>
        <button className="menu-item" onClick={handleExportSvg} aria-label="Export canvas to vector SVG">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCode size={16} />
            <span>Export SVG...</span>
          </div>
        </button>

        <div className="menu-divider" />

        <button
          className="menu-item"
          onClick={() => {
            onShowShortcuts?.();
            setIsOpen(false);
          }}
          aria-label="Keyboard Shortcuts & Help"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Keyboard size={16} />
            <span>Shortcuts & Tools</span>
          </div>
          <span className="menu-item-shortcut">?</span>
        </button>
        <button className="menu-item" onClick={() => { onFit(); setIsOpen(false); }} aria-label="Fit board to screen">
          <Scan size={16} />
          <span>Fit board to screen</span>
        </button>
        {!isViewer && <button className="menu-item" onClick={() => { onClear(); setIsOpen(false); }} aria-label="Reset the canvas">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RotateCcw size={16} />
            <span>Reset the canvas</span>
          </div>
        </button>}
        {onDeleteBoard && <button
          className="menu-item"
          onClick={() => {
            if (window.confirm("Permanently delete this board? This action cannot be undone.")) {
              onDeleteBoard?.();
              setIsOpen(false);
            }
          }}
          aria-label="Delete this board"
          style={{ color: "#ef4444" }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trash2 size={16} />
            <span>Delete board</span>
          </div>
        </button>}

        <div className="menu-divider" />

        <div className="sidebar-section">
          <h4>Preferences</h4>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              className={`tool-button ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
              title="Light theme"
              aria-label="Switch to light theme"
            >
              <Sun size={14} />
            </button>
            <button
              className={`tool-button ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
              title="Dark theme"
              aria-label="Switch to dark theme"
            >
              <Moon size={14} />
            </button>
          </div>
        </div>

        {/* P1-6: Recent Boards Drawer Section */}
        {recentBoards.length > 0 && (
          <>
            <div className="menu-divider" />
            <div className="sidebar-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h4>Recent Boards</h4>
                <button
                  onClick={() => setRecentBoards(clearRecentBoards())}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em"
                  }}
                  title="Clear history"
                >
                  Clear all
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
                {recentBoards.map((b) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setIsOpen(false);
                        window.location.href = `/board/${encodeURIComponent(b.id)}`;
                      }}
                      style={{ fontSize: "12px", padding: "6px 8px", flex: 1, minWidth: 0, justifyContent: "flex-start" }}
                    >
                      <Clock size={13} style={{ color: "var(--muted)", flexShrink: 0, marginRight: "6px" }} />
                      <span style={{ color: b.id === boardId ? "var(--accent)" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.title ? b.title : `Board #${b.id.slice(0, 8)}`} {b.id === boardId ? "(current)" : ""}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecentBoards(removeRecentBoard(b.id));
                      }}
                      title="Remove from recents"
                      aria-label={`Remove board ${b.id.slice(0, 8)} from recents`}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        padding: "6px",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: "4px"
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="menu-divider" />

        <div className="sidebar-section">
          <h4>Links</h4>
          <button className="menu-item" onClick={() => window.location.href = "/"} aria-label="Go to homepage">
            <Globe size={16} />
            <span>Workspace home</span>
          </button>
        </div>
      </div>
      )}
    </>
  );
}
