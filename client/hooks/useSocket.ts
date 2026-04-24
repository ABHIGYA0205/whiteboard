"use client";

import { useBoardStore } from "@/store/boardStore";
import type {
  CursorPosition,
  DrawEventPayload,
  UpdateElementPayload,
  WhiteboardElement
} from "@shared/types";
import type { Socket } from "socket.io-client";
import { useEffect, useMemo, useRef } from "react";

const THROTTLE_MS = 16;
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4001";

export function useSocket(boardId: string) {
  const upsertRemoteElement = useBoardStore((state) => state.upsertRemoteElement);
  const upsertRemoteCursor = useBoardStore((state) => state.upsertRemoteCursor);
  const syncElements = useBoardStore((state) => state.syncElements);
  const socketRef = useRef<Socket | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const queuedCursorRef = useRef<Omit<CursorPosition, "userId"> | null>(null);
  const lastCursorSentRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let activeSocket: Socket | null = null;

    const setupSocket = async () => {
      const { io } = await import("socket.io-client");
      if (!isMounted) {
        return;
      }

      activeSocket = io(SOCKET_URL, {
        autoConnect: true,
        transports: ["websocket"]
      });
      socketRef.current = activeSocket;
      activeSocket.emit("join-board", { boardId });

      const handleDraw = ({ element }: DrawEventPayload) => {
        upsertRemoteElement(element);
      };

      const handleUpdateElement = ({ element }: UpdateElementPayload) => {
        upsertRemoteElement(element);
      };

      const handleCursor = ({ cursor }: { cursor: CursorPosition }) => {
        upsertRemoteCursor(cursor);
      };

      const handleClear = () => {
        syncElements([]);
      };

      const handleReplace = ({ elements }: { elements: WhiteboardElement[] }) => {
        syncElements(elements);
      };

      activeSocket.on("draw", handleDraw);
      activeSocket.on("update-element", handleUpdateElement);
      activeSocket.on("cursor-position", handleCursor);
      activeSocket.on("clear-board", handleClear);
      activeSocket.on("replace-elements", handleReplace);

      return () => {
        activeSocket?.emit("leave-board", { boardId });
        activeSocket?.off("draw", handleDraw);
        activeSocket?.off("update-element", handleUpdateElement);
        activeSocket?.off("cursor-position", handleCursor);
        activeSocket?.off("clear-board", handleClear);
        activeSocket?.off("replace-elements", handleReplace);
        activeSocket?.disconnect();
        if (socketRef.current === activeSocket) {
          socketRef.current = null;
        }
      };
    };

    let cleanupSocket: (() => void) | undefined;
    void setupSocket().then((cleanup) => {
      cleanupSocket = cleanup;
    });

    return () => {
      isMounted = false;
      cleanupSocket?.();
    };
  }, [boardId, syncElements, upsertRemoteCursor, upsertRemoteElement]);

  return useMemo(
    () => ({
      emitDraw(element: WhiteboardElement) {
        socketRef.current?.emit("draw", { boardId, element });
      },
      emitElementUpdate(element: WhiteboardElement) {
        socketRef.current?.emit("update-element", { boardId, element });
      },
      emitCursor(cursor: Omit<CursorPosition, "userId">) {
        queuedCursorRef.current = cursor;

        if (cursorFrameRef.current !== null) {
          return;
        }

        cursorFrameRef.current = window.requestAnimationFrame(() => {
          const now = Date.now();
          if (now - lastCursorSentRef.current >= THROTTLE_MS && queuedCursorRef.current) {
            socketRef.current?.emit("cursor-position", {
              boardId,
              cursor: queuedCursorRef.current
            });
            lastCursorSentRef.current = now;
          }
          cursorFrameRef.current = null;
        });
      },
      emitClear() {
        socketRef.current?.emit("clear-board", { boardId });
      },
      emitReplace(elements: WhiteboardElement[]) {
        socketRef.current?.emit("replace-elements", { boardId, elements });
      }
    }),
    [boardId]
  );
}
