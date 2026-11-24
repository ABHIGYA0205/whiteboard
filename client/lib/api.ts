import type { BoardDocument, BoardOp, WhiteboardElement } from "@shared/types";
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
    headers,
    signal: init?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
      : init?.signal
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
    let code: string | undefined;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      if (body?.code) code = body.code;
    } catch {
      // ignore parse errors
    }
    const error = new Error(message) as Error & { status?: number; code?: string; retryAfterMs?: number };
    error.status = response.status;
    if (code) error.code = code;
    const delay = Number(response.headers.get("Retry-After"));
    if (delay > 0) error.retryAfterMs = delay * 1000;
    throw error;
  }

  return response.json() as Promise<T>;
}

export async function createBoard(): Promise<BoardDocument> {
  const board = await request<BoardDocument & { ownerToken?: string }>("/board", { method: "POST" });
  if (board.id && board.ownerToken) setToken(board.id, board.ownerToken);
  return board;
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

export function getBoard(id: string, signal?: AbortSignal): Promise<BoardDocument> {
  return request<BoardDocument>(`/board/${id}`, { signal }, id);
}

export function saveBoardChanges(
  id: string,
  changes: ReadonlyMap<string, WhiteboardElement | null>,
  signal?: AbortSignal
) {
  const ops: BoardOp[] = [];
  for (const [elementId, element] of changes) {
    if (element) ops.push({ op: "update", element });
    else ops.push({ op: "delete", element: { id: elementId } as WhiteboardElement });
  }
  return request<{ version: number; elements: WhiteboardElement[]; deletedIds: string[] }>(
    `/board/${id}/ops?compact=1`,
    { method: "POST", body: JSON.stringify({ ops }), signal },
    id
  );
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
  sketchIgnored?: string | null;
}

export type AiCapabilities = {
  sketch: boolean;
  sketchModel: string | null;
  /** Why sketch-guided generation is off: never set up, no credit left, or the key was rejected. */
  reason?: "not_configured" | "credit" | "key" | null;
};

export async function getAiCapabilities(): Promise<AiCapabilities> {
  try {
    return await request<AiCapabilities>("/ai/capabilities");
  } catch {
    return { sketch: false, sketchModel: null };
  }
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
    sketchIgnored?: string | null;
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
      sketchIgnored: initial.sketchIgnored,
      seed: initial.seed
    };
  }

  if (!initial.jobId) {
    throw new Error("No image URL or job ID returned from server.");
  }

  const jobId = initial.jobId;
  const maxAttempts = 100; // 100 * 1500ms = 150 seconds (2.6)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await request<{
      status: "pending" | "processing" | "completed" | "failed";
      progress: number;
      imageUrl?: string;
      error?: string;
      errorCode?: string;
      retryAfter?: number;
      provider?: string;
      model?: string;
      sketchGuided?: boolean;
      sketchIgnored?: string | null;
      seed?: number;
    }>(`/ai/job/${jobId}`);

    onProgress?.(status.progress || 0);

    if (status.status === "completed" && status.imageUrl) {
      return {
        imageUrl: resolveImageUrl(status.imageUrl),
        provider: status.provider,
        model: status.model,
        sketchGuided: status.sketchGuided,
        sketchIgnored: status.sketchIgnored,
        seed: status.seed
      };
    }

    if (status.status === "failed") {
      const err = new Error(status.error || "Image generation failed.") as Error & {
        code?: string;
        retryAfter?: number;
      };
      err.code = status.errorCode;
      err.retryAfter = status.retryAfter;
      throw err;
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
