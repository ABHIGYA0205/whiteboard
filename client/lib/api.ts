import type { BoardDocument, BoardOp, WhiteboardElement } from "@shared/types";
import { sameElement } from "@shared/collab";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
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
    return await request<BoardDocument>("/board", {
      method: "POST"
    });
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

export async function getBoard(id: string): Promise<BoardDocument> {
  try {
    return await request<BoardDocument>(`/board/${id}`);
  } catch (error) {
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
  });
}

export function saveBoardOps(id: string, ops: BoardOp[], version?: number) {
  return request<BoardDocument>(`/board/${id}/ops`, {
    method: "POST",
    body: JSON.stringify({ ops, version })
  });
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
  });
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

/**
 * A4.3: Enhance sketch with job-polling support
 */
export async function enhanceSketch(
  imageBase64: string,
  prompt: string,
  onProgress?: (progress: number) => void
): Promise<{ imageUrl: string }> {
  const initial = await request<{ imageUrl?: string; jobId?: string; cached?: boolean }>("/ai/enhance", {
    method: "POST",
    body: JSON.stringify({ imageBase64, prompt })
  });

  if (initial.imageUrl) {
    return { imageUrl: resolveImageUrl(initial.imageUrl) };
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
    }>(`/ai/job/${jobId}`);

    onProgress?.(status.progress || 0);

    if (status.status === "completed" && status.imageUrl) {
      return { imageUrl: resolveImageUrl(status.imageUrl) };
    }

    if (status.status === "failed") {
      throw new Error(status.error || "Image generation failed.");
    }
  }

  throw new Error("Image enhancement timed out.");
}
