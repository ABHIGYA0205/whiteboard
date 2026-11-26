"use client";

import { useEffect } from "react";
import { useBoardStore } from "@/store/boardStore";

export function WorkspaceTheme() {
  useEffect(() => {
    const key = "canvasflow:theme";
    try {
      const stored = localStorage.getItem(key);
      if (stored === "light" || stored === "dark") useBoardStore.getState().setTheme(stored);
    } catch {
      // The theme can still change for this visit when storage is unavailable.
    }

    document.documentElement.dataset.theme = useBoardStore.getState().theme;
    return useBoardStore.subscribe(({ theme }, previous) => {
      if (theme === previous.theme) return;
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem(key, theme);
      } catch {
        // Keep the active theme even when it cannot be saved.
      }
    });
  }, []);

  return null;
}
