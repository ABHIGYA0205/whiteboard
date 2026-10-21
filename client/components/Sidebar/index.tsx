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
  Keyboard
} from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import { exportToSvg } from "@/components/Canvas/drawingUtils";

type SidebarProps = {
  boardId: string;
  onClear: () => void;
  onShowShortcuts?: () => void;
};

export function Sidebar({ boardId, onClear, onShowShortcuts }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useBoardStore((state) => state.theme);
  const setTheme = useBoardStore((state) => state.setTheme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const elements = useBoardStore((state) => state.elements);
  const loadBoard = useBoardStore((state) => state.loadBoard);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Close menu on click outside on the board
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const handleFileOpen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          loadBoard(parsed);
          setIsOpen(false);
        }
      } catch (error) {
        console.error("Failed to parse board file", error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
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

  // A6.1: Theme-aware export where canvas background matches theme precisely
  const handleExport = () => {
    const canvas = document.querySelector(".board-canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = theme === "dark" ? "#010409" : "#f8fafc";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `whiteboard-${boardId.slice(0, 8)}.png`;
    link.href = dataUrl;
    link.click();
    setIsOpen(false);
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
          className="sidebar-panel open"
          ref={panelRef}
          role="dialog"
          aria-label="Board settings and file menu"
          aria-modal={isOpen}
        >
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".json" 
          onChange={handleFileOpen} 
        />
        <button className="menu-item" onClick={handleOpenClick} aria-label="Open board file">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderOpen size={16} />
            <span>Open</span>
          </div>
          <span className="menu-item-shortcut">Cmd+O</span>
        </button>
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
        <button className="menu-item" onClick={() => { onClear(); setIsOpen(false); }} aria-label="Reset the canvas">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RotateCcw size={16} />
            <span>Reset the canvas</span>
          </div>
        </button>

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

        <div className="menu-divider" />

        <div className="sidebar-section">
          <h4>Links</h4>
          <button className="menu-item" onClick={() => window.location.href = "/"} aria-label="Go to homepage">
            <Globe size={16} />
            <span>Website</span>
          </button>
        </div>
      </div>
      )}
    </>
  );
}
