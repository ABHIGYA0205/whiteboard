import type { BoardDocument, WhiteboardElement } from "@shared/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    // Try to extract a meaningful error message from the server
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function createBoard() {
  return request<BoardDocument>("/board", {
    method: "POST"
  });
}

export function getBoard(id: string) {
  return request<BoardDocument>(`/board/${id}`);
}

export function saveBoard(id: string, elements: WhiteboardElement[]) {
  return request<BoardDocument>(`/board/${id}`, {
    method: "PUT",
    body: JSON.stringify({ elements })
  });
}

export function clearBoardRemote(id: string) {
  return saveBoard(id, []);
}

export function cleanBoard(elements: WhiteboardElement[]) {
  return request<{ elements: WhiteboardElement[] }>("/board/clean", {
    method: "POST",
    body: JSON.stringify({ elements })
  }).then((response) => response.elements);
}

export function enhanceSketch(imageBase64: string, prompt: string) {
  return request<{ imageUrl: string }>("/ai/enhance", {
    method: "POST",
    body: JSON.stringify({ imageBase64, prompt })
  });
}
