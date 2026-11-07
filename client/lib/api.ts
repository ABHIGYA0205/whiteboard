import type { BoardDocument, BoardOp, WhiteboardElement } from "@shared/types";
import { sameElement } from "@shared/collab";
import { getToken, setToken, clearToken } from "./boardAuth";
import { useBoardStore } from "@/store/boardStore";

export const getApiUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.trim();
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:4001`;
  }
  return "http://localhost:4001";
};

export function resolveImageUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const baseUrl = getApiUrl();
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${baseUrl}${cleanPath}`;
}

async function request<T>(path: string, init?: RequestInit, explicitBoardId?: string): Promise<T> {
  const baseUrl = getApiUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  let boardId = explicitBoardId;
  if (!boardId) {
    const match = path.match(/^\/board\/([^/?]+)/);
    if (match && match[1] !== "upload" && match[1] !== "clean") {
      boardId = match[1];
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> ?? {})
  };

  if (boardId) {
    const token = getToken(boardId);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (!response.ok) {
    if (response.status === 401 && boardId) {
      clearToken(boardId);
      if (typeof window !== "undefined") {
        try {
          useBoardStore.getState().setIsLocked(true);
        } catch {
          // ignore
        }
      }
    }

    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

export async function createBoard(): Promise<BoardDocument> {
  try {
    const board = await request<BoardDocument & { ownerToken?: string }>("/board", {
      method: "POST"
    });
    if (board.id && board.ownerToken) {
      setToken(board.id, board.ownerToken);
    }
    return board;
  } catch (error) {
    console.warn("Backend createBoard failed, providing local session board:", error);
    const localId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 11);

    return {
      id: localId,
      version: 0,
      elements: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

export async function claimBoard(id: string): Promise<{ ownerToken: string; board: BoardDocument }> {
  const result = await request<{ ownerToken: string; board: BoardDocument }>(
    `/board/${id}/claim`,
    {
      method: "POST"
    },
    id
  );
  if (result.ownerToken) {
    setToken(id, result.ownerToken);
  }
  return result;
}

export function createShareLink(
  id: string,
  role: "editor" | "viewer",
  ttlHours?: number
): Promise<{ token: string; url: string }> {
  return request<{ token: string; url: string }>(
    `/board/${id}/share`,
    {
      method: "POST",
      body: JSON.stringify({ role, ttlHours })
    },
    id
  );
}

export async function getBoard(id: string): Promise<BoardDocument> {
  try {
    return await request<BoardDocument>(`/board/${id}`, undefined, id);
  } catch (error: any) {
    if (error?.status === 401) {
      throw error;
    }
    console.warn(`Backend getBoard(${id}) failed, providing fallback:`, error);
    return {
      id,
      version: 0,
      elements: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

export function saveBoard(
  id: string,
  elements: WhiteboardElement[],
  version?: number,
  deletedIds?: string[]
) {
  return request<BoardDocument>(`/board/${id}`, {
    method: "PUT",
    body: JSON.stringify({ elements, version, deletedIds })
  }, id);
}

export function saveBoardOps(id: string, ops: BoardOp[], version?: number) {
  return request<BoardDocument>(`/board/${id}/ops`, {
    method: "POST",
    body: JSON.stringify({ ops, version })
  }, id);
}

/**
 * Autosave that uploads only what changed since the last successful save.
 * The full-board PUT re-uploaded every element every 4 s (tens of KB on a busy
 * board), which is what pushed small hosted instances into stalls.
 */
export async function saveBoardDelta(
  id: string,
  elements: WhiteboardElement[],
  previouslySaved: Map<string, WhiteboardElement>,
  deletedIds: string[],
  version?: number
): Promise<{ board: BoardDocument; sentIds: string[]; removedIds: string[] }> {
  const currentIds = new Set(elements.map((element) => element.id));
  const ops: BoardOp[] = [];
  const sentIds: string[] = [];

  for (const element of elements) {
    const previous = previouslySaved.get(element.id);
    if (!previous || !sameElement(previous, element)) {
      ops.push({ op: previous ? "update" : "add", element });
      sentIds.push(element.id);
    }
  }

  const removedIds = [
    ...Array.from(previouslySaved.keys()).filter((elementId) => !currentIds.has(elementId)),
    ...deletedIds.filter((elementId) => !currentIds.has(elementId))
  ].filter((elementId, index, all) => all.indexOf(elementId) === index);

  for (const elementId of removedIds) {
    // The delete op only needs an id; a minimal stub satisfies the type.
    ops.push({ op: "delete", element: { id: elementId } as WhiteboardElement });
  }

  if (ops.length === 0) {
    return { board: { id, version: version ?? 0, elements } as BoardDocument, sentIds, removedIds };
  }

  const board = await saveBoardOps(id, ops, version);
  return { board, sentIds, removedIds };
}

export function clearBoardRemote(id: string) {
  return saveBoard(id, []);
}

export function deleteBoardRemote(id: string) {
  return request<{ success: boolean; message?: string }>(`/board/${id}`, {
    method: "DELETE"
  }, id);
}

export async function uploadImage(imageBase64: string): Promise<{ url: string }> {
  const res = await request<{ url: string }>("/board/upload", {
    method: "POST",
    body: JSON.stringify({ imageBase64 })
  });
  return { url: resolveImageUrl(res.url) };
}

export function cleanBoard(elements: WhiteboardElement[]) {
  return request<{ elements: WhiteboardElement[] }>("/board/clean", {
    method: "POST",
    body: JSON.stringify({ elements })
  }).then((response) => response.elements);
}

export interface GenerateAiImageOptions {
  imageBase64?: string;
  prompt: string;
  styleId?: string;
  literal?: number;
  seed?: number;
  aspect?: "square" | "portrait" | "landscape";
  bounds?: { width: number; height: number };
  allowTextOnly?: boolean;
}

export interface GenerateAiImageResult {
  imageUrl: string;
  seed?: number;
  provider?: string;
  model?: string;
  sketchGuided?: boolean;
}

/**
 * A4.3: Generate AI image conditioned on sketch with job polling
 */
export async function generateAiImage(
  options: GenerateAiImageOptions,
  onProgress?: (progress: number) => void
): Promise<GenerateAiImageResult> {
  const initial = await request<{
    imageUrl?: string;
    jobId?: string;
    cached?: boolean;
    provider?: string;
    model?: string;
    sketchGuided?: boolean;
    seed?: number;
  }>("/ai/generate", {
    method: "POST",
    body: JSON.stringify(options)
  });

  if (initial.imageUrl) {
    return {
      imageUrl: resolveImageUrl(initial.imageUrl),
      provider: initial.provider,
      model: initial.model,
      sketchGuided: initial.sketchGuided,
      seed: initial.seed
    };
  }

  if (!initial.jobId) {
    throw new Error("No image URL or job ID returned from server.");
  }

  const jobId = initial.jobId;
  const maxAttempts = 60; // Up to 90 seconds
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await request<{
      status: "pending" | "processing" | "completed" | "failed";
      progress: number;
      imageUrl?: string;
      error?: string;
      provider?: string;
      model?: string;
      sketchGuided?: boolean;
      seed?: number;
    }>(`/ai/job/${jobId}`);

    onProgress?.(status.progress || 0);

    if (status.status === "completed" && status.imageUrl) {
      return {
        imageUrl: resolveImageUrl(status.imageUrl),
        provider: status.provider,
        model: status.model,
        sketchGuided: status.sketchGuided,
        seed: status.seed
      };
    }

    if (status.status === "failed") {
      throw new Error(status.error || "Image generation failed.");
    }
  }

  throw new Error("Image enhancement timed out.");
}

/**
 * Backwards-compatible alias for sketch enhancement
 */
export async function enhanceSketch(
  imageBase64: string,
  prompt: string,
  onProgress?: (progress: number) => void
): Promise<{ imageUrl: string }> {
  return generateAiImage({ imageBase64, prompt }, onProgress);
}
