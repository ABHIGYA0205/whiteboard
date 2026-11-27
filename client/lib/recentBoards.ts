import { DEFAULT_BOARD_TITLE } from "@shared/types";

const storageKey = "whiteboard_recent_boards";

export type RecentBoard = { id: string; title: string; visitedAt: number };

export function readRecentBoards(): RecentBoard[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => {
      if (!entry || typeof entry.id !== "string" || !entry.id || !Number.isFinite(entry.visitedAt)) return [];
      const title = typeof entry.title === "string" && entry.title.trim();
      return [{ id: entry.id, title: title || readLegacyTitle(entry.id) || DEFAULT_BOARD_TITLE, visitedAt: entry.visitedAt }];
    });
  } catch {
    return [];
  }
}

export function readLegacyTitle(id: string): string | null {
  try {
    return localStorage.getItem(`whiteboard_title_${id}`)?.trim() || null;
  } catch {
    return null;
  }
}

export function clearLegacyTitle(id: string): void {
  try {
    localStorage.removeItem(`whiteboard_title_${id}`);
  } catch {
    // Renaming on the server still works when browser storage is disabled.
  }
}

function writeRecentBoards(boards: RecentBoard[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(boards));
  } catch {
    // The board itself remains accessible by URL.
  }
  return boards;
}

export function rememberRecentBoard(id: string, title: string) {
  const previous = readRecentBoards().filter((board) => board.id !== id);
  writeRecentBoards([{ id, title, visitedAt: Date.now() }, ...previous].slice(0, 10));
}

export function removeRecentBoard(id: string) {
  return writeRecentBoards(readRecentBoards().filter((board) => board.id !== id));
}

export function clearRecentBoards() {
  return writeRecentBoards([]);
}
