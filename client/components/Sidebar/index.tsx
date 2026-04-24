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
  Globe
} from "lucide-react";
import { useBoardStore } from "@/store/boardStore";

type SidebarProps = {
  boardId: string;
  onClear: () => void;
};

export function Sidebar({ boardId, onClear }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const elements = useBoardStore((state) => state.elements);
  const loadBoard = useBoardStore((state) => state.loadBoard);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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

  const handleExport = () => {
    const canvas = document.querySelector(".board-canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = theme === "dark" ? "#121212" : "#ffffff";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `whiteboard-${boardId.slice(0, 8)}.png`;
    link.href = dataUrl;
    link.click();
    setIsOpen(false);
  };

  return (
    <>
      <button
        className="sidebar-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Open menu"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`sidebar-panel ${isOpen ? "open" : ""}`}>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".json" 
          onChange={handleFileOpen} 
        />
        <button className="menu-item" onClick={handleOpenClick}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderOpen size={16} />
            <span>Open</span>
          </div>
          <span className="tool-shortcut">Cmd+O</span>
        </button>
        <button className="menu-item" onClick={handleSaveTo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Save size={16} />
            <span>Save to...</span>
          </div>
        </button>
        <button className="menu-item" onClick={handleExport}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Download size={16} />
            <span>Export image...</span>
          </div>
          <span className="tool-shortcut">Cmd+Shift+E</span>
        </button>

        <div className="menu-divider" />

        <button className="menu-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HelpCircle size={16} />
            <span>Help</span>
          </div>
          <span className="tool-shortcut">?</span>
        </button>
        <button className="menu-item" onClick={() => { onClear(); setIsOpen(false); }}>
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
            >
              <Sun size={14} />
            </button>
            <button
              className={`tool-button ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
              title="Dark theme"
            >
              <Moon size={14} />
            </button>
          </div>
        </div>

        <div className="menu-divider" />

        <div className="sidebar-section">
          <h4>Links</h4>
          <button className="menu-item" onClick={() => window.location.href = "/"}>
            <Globe size={16} />
            <span>Website</span>
          </button>
        </div>
      </div>
    </>
  );
}
