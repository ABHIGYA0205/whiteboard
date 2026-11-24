export type BoardRole = "owner" | "editor" | "viewer";

export interface BoardTokenPayload {
  boardId: string;
  role: BoardRole;
  exp: number;
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  if (typeof atob !== "undefined") {
    return atob(base64);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  return "";
}

const tabTokens = new Map<string, string>();
const roleRank = { viewer: 1, editor: 2, owner: 3 };

export function getToken(boardId: string): string | null {
  if (typeof window === "undefined" || !boardId) return null;
  const active = tabTokens.get(boardId);
  if (active) return active;
  try {
    const key = `canvasflow:token:${boardId}`;
    const token = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (token) tabTokens.set(boardId, token);
    return token;
  } catch {
    return null;
  }
}

export function setToken(boardId: string, token: string): void {
  if (typeof window === "undefined" || !boardId || !token) return;
  tabTokens.set(boardId, token);
  try {
    const key = `canvasflow:token:${boardId}`;
    sessionStorage.setItem(key, token);
    // Follow the share link's role in this tab. Keep the strongest reusable
    // credential for new tabs opened from the dashboard.
    const role = decodeRole(token);
    const storedRole = decodeRole(localStorage.getItem(key));
    if (role && (!storedRole || roleRank[role] >= roleRank[storedRole])) {
      localStorage.setItem(key, token);
    }
  } catch {
    // The current document can still use the in-memory token.
  }
}

export function clearToken(boardId: string): void {
  if (typeof window === "undefined" || !boardId) return;
  const active = getToken(boardId);
  tabTokens.delete(boardId);
  try {
    const key = `canvasflow:token:${boardId}`;
    sessionStorage.removeItem(key);
    if (localStorage.getItem(key) === active) localStorage.removeItem(key);
  } catch {
    // Browser storage may be unavailable.
  }
}

export function decodeRole(token: string | null | undefined): BoardRole | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const jsonStr = base64UrlDecode(parts[0]);
    const payload = JSON.parse(jsonStr) as Partial<BoardTokenPayload>;
    if (
      payload &&
      (payload.role === "owner" || payload.role === "editor" || payload.role === "viewer")
    ) {
      return payload.role;
    }
  } catch {
    return null;
  }
  return null;
}
