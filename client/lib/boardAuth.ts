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

export function getToken(boardId: string): string | null {
  if (typeof window === "undefined" || !boardId) return null;
  try {
    return localStorage.getItem(`canvasflow:token:${boardId}`);
  } catch {
    return null;
  }
}

export function setToken(boardId: string, token: string): void {
  if (typeof window === "undefined" || !boardId || !token) return;
  try {
    localStorage.setItem(`canvasflow:token:${boardId}`, token);
  } catch {
    // localStorage might be unavailable/restricted in some environments
  }
}

export function clearToken(boardId: string): void {
  if (typeof window === "undefined" || !boardId) return;
  try {
    localStorage.removeItem(`canvasflow:token:${boardId}`);
  } catch {
    // ignore
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
