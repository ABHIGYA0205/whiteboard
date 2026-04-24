"use client";

import { Canvas } from "@/components/Canvas/Canvas";
import { Toolbar } from "@/components/Toolbar";
import { Sidebar } from "@/components/Sidebar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { clearBoardRemote, getBoard, saveBoard } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { useBoardStore } from "@/store/boardStore";
import { useEffect, useRef, useState } from "react";
import { 
  Undo2, 
  Redo2, 
  Plus, 
  Minus, 
  Search, 
  ShieldCheck, 
  HelpCircle,
  Share2,
  ChevronUp
} from "lucide-react";

type BoardPageProps = {
  params: {
    id: string;
  };
};

export default function BoardPage({ params }: BoardPageProps) {
  const boardId = params.id;
  const elements = useBoardStore((state) => state.elements);
  const loadBoard = useBoardStore((state) => state.loadBoard);
  const clearBoard = useBoardStore((state) => state.clearBoard);
  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const canUndo = useBoardStore((state) => state.history.length > 0);
  const canRedo = useBoardStore((state) => state.future.length > 0);
  const viewport = useBoardStore((state) => state.viewport);
  const setZoom = useBoardStore((state) => state.setZoom);
  
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedSnapshot = useRef("");
  const latestElementsRef = useRef(elements);

  const collaboration = useSocket(boardId);

  useEffect(() => {
    latestElementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const board = await getBoard(boardId);
        if (!cancelled) {
          loadBoard(board.elements);
          lastSavedSnapshot.current = JSON.stringify(board.elements);
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError(error instanceof Error ? error.message : "Failed to load board.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [boardId, loadBoard]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const snapshot = JSON.stringify(latestElementsRef.current);
      if (snapshot === lastSavedSnapshot.current) return;
      try {
        await saveBoard(boardId, latestElementsRef.current);
        lastSavedSnapshot.current = snapshot;
        setSaveError(null);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Auto-save failed.");
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [boardId]);

  const handleClear = async () => {
    clearBoard();
    collaboration.emitClear();
    try {
      await clearBoardRemote(boardId);
      lastSavedSnapshot.current = JSON.stringify([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to clear.");
    }
  };

  useKeyboardShortcuts({
    onClear: handleClear,
    onReplace: collaboration.emitReplace
  });

  if (isLoading) {
    return <main className="status-shell">Loading board...</main>;
  }

  return (
    <main className="board-shell">
      {/* Top UI */}
      <Sidebar boardId={boardId} onClear={handleClear} />
      <Toolbar />
      
      {/* Main Area */}
      <div className="workspace-shell">
        <Canvas collaboration={collaboration} />
      </div>

      {/* Bottom UI */}
      <div className="bottom-left-controls">
        <div className="control-group">
          <button className="control-button" onClick={() => setZoom(viewport.zoom * 0.9)}><Minus size={16} /></button>
          <div className="zoom-display">{Math.round(viewport.zoom * 100)}%</div>
          <button className="control-button" onClick={() => setZoom(viewport.zoom * 1.1)}><Plus size={16} /></button>
        </div>
        <div className="control-group">
          <button className="control-button" onClick={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.4 }}><Undo2 size={16} /></button>
          <button className="control-button" onClick={redo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.4 }}><Redo2 size={16} /></button>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: '12px', right: '12px', zIndex: 100, display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button className="control-button" style={{ color: '#6965db' }}><ShieldCheck size={20} /></button>
        <button className="control-button"><HelpCircle size={20} /></button>
      </div>

      {saveError ? <div className="status-banner">{saveError}</div> : null}
    </main>
  );
}
