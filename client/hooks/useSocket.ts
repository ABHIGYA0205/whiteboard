"use client";

import { useBoardStore } from "@/store/boardStore";
import type {
  CursorPosition,
  DrawEventPayload,
  PresenceUser,
  UpdateElementPayload,
  WhiteboardElement
} from "@shared/types";
import type { Socket } from "socket.io-client";
import { useEffect, useMemo, useRef } from "react";

const THROTTLE_MS = 16;
const getSocketUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
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

const getLocalUserId = () => {
  if (typeof window === "undefined") return "temp_user";
  let id = localStorage.getItem("whiteboard_user_id");
  if (!id) {
    id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "u_" + Math.random().toString(36).substring(2, 11);
    localStorage.setItem("whiteboard_user_id", id);
  }
  return id;
};

export function useSocket(boardId: string) {
  const upsertRemoteElement = useBoardStore((state) => state.upsertRemoteElement);
  const upsertRemoteCursor = useBoardStore((state) => state.upsertRemoteCursor);
  const removeRemoteCursor = useBoardStore((state) => state.removeRemoteCursor);
  const cleanStaleCursors = useBoardStore((state) => state.cleanStaleCursors);
  const setPresenceUsers = useBoardStore((state) => state.setPresenceUsers);
  const addPresenceUser = useBoardStore((state) => state.addPresenceUser);
  const removePresenceUser = useBoardStore((state) => state.removePresenceUser);
  const syncElements = useBoardStore((state) => state.syncElements);
  const setCurrentUserId = useBoardStore((state) => state.setCurrentUserId);

  const socketRef = useRef<Socket | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const trailingTimerRef = useRef<number | null>(null);
  const queuedCursorRef = useRef<Omit<CursorPosition, "userId"> | null>(null);
  const lastCursorSentRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let activeSocket: Socket | null = null;

    const setupSocket = async () => {
      const { io } = await import("socket.io-client");
      if (!isMounted) return;

      const localId = getLocalUserId();
      const storedName = typeof window !== "undefined" ? localStorage.getItem("whiteboard_user_name") : null;

      activeSocket = io(getSocketUrl(), {
        autoConnect: true,
        transports: ["websocket"],
        auth: {
          userId: localId,
          name: storedName || undefined
        }
      });
      socketRef.current = activeSocket;

      // Initial join and state request
      const join = () => {
        const currentName = typeof window !== "undefined" ? localStorage.getItem("whiteboard_user_name") : null;
        activeSocket?.emit("join-board", { boardId, userName: currentName || undefined });
        activeSocket?.emit("request-state", { boardId });
      };

      activeSocket.on("connect", join);
      if (activeSocket.connected) {
        join();
      }

      const handleIdentity = (identity: PresenceUser) => {
        if (identity?.userId) {
          setCurrentUserId(identity.userId);
        }
      };
      activeSocket.on("identity", handleIdentity);

      // Reconnect / state sync (A2.4)
      const handleBoardState = ({
        elements,
        version
      }: {
        boardId: string;
        elements: WhiteboardElement[];
        version: number;
      }) => {
        const localVersion = useBoardStore.getState().version;
        if (version >= localVersion) {
          syncElements(elements, version);
        }
      };

      const handleDraw = ({ element }: DrawEventPayload) => {
        upsertRemoteElement(element);
      };

      const handleUpdateElement = ({ element }: UpdateElementPayload) => {
        upsertRemoteElement(element);
      };

      const handleCursor = ({ cursor }: { cursor: CursorPosition }) => {
        upsertRemoteCursor(cursor);
      };

      const handleCursorLeave = ({ userId }: { userId: string }) => {
        removeRemoteCursor(userId);
      };

      const handlePresenceState = ({ users }: { users: PresenceUser[] }) => {
        setPresenceUsers(users);
      };

      const handlePresenceJoin = ({ user }: { user: PresenceUser }) => {
        addPresenceUser(user);
      };

      const handlePresenceLeave = ({ userId }: { userId: string }) => {
        removePresenceUser(userId);
        removeRemoteCursor(userId);
      };

      const handleClear = () => {
        syncElements([]);
      };

      const handleReplace = ({ elements, version }: { elements: WhiteboardElement[]; version?: number }) => {
        const localVersion = useBoardStore.getState().version;
        if (version === undefined || version >= localVersion) {
          syncElements(elements, version ?? (localVersion + 1));
        }
      };

      const handleBoardDeleted = () => {
        alert("This board has been deleted.");
        window.location.href = "/";
      };

      const handleLaser = ({ point, color }: { point: { x: number; y: number }; color: string }) => {
        useBoardStore.getState().addLaserPoint(point, color);
      };

      activeSocket.on("board:state", handleBoardState);
      activeSocket.on("draw", handleDraw);
      activeSocket.on("update-element", handleUpdateElement);
      activeSocket.on("cursor-position", handleCursor);
      activeSocket.on("cursor-leave", handleCursorLeave);
      activeSocket.on("presence:state", handlePresenceState);
      activeSocket.on("presence:join", handlePresenceJoin);
      activeSocket.on("presence:leave", handlePresenceLeave);
      activeSocket.on("clear-board", handleClear);
      activeSocket.on("replace-elements", handleReplace);
      activeSocket.on("board-deleted", handleBoardDeleted);
      activeSocket.on("laser-point", handleLaser);

      return () => {
        activeSocket?.emit("leave-board", { boardId });
        activeSocket?.off("identity", handleIdentity);
        activeSocket?.off("connect", join);
        activeSocket?.off("board:state", handleBoardState);
        activeSocket?.off("draw", handleDraw);
        activeSocket?.off("update-element", handleUpdateElement);
        activeSocket?.off("cursor-position", handleCursor);
        activeSocket?.off("cursor-leave", handleCursorLeave);
        activeSocket?.off("presence:state", handlePresenceState);
        activeSocket?.off("presence:join", handlePresenceJoin);
        activeSocket?.off("presence:leave", handlePresenceLeave);
        activeSocket?.off("clear-board", handleClear);
        activeSocket?.off("replace-elements", handleReplace);
        activeSocket?.off("board-deleted", handleBoardDeleted);
        activeSocket?.off("laser-point", handleLaser);
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

    // Cleanup stale remote cursors periodically (A3.2)
    const cleanupInterval = window.setInterval(() => {
      cleanStaleCursors();
    }, 4000);

    return () => {
      isMounted = false;
      cleanupSocket?.();
      window.clearInterval(cleanupInterval);
      if (trailingTimerRef.current !== null) {
        window.clearTimeout(trailingTimerRef.current);
      }
      if (cursorFrameRef.current !== null) {
        window.cancelAnimationFrame(cursorFrameRef.current);
      }
    };
  }, [
    boardId,
    addPresenceUser,
    cleanStaleCursors,
    removePresenceUser,
    removeRemoteCursor,
    setPresenceUsers,
    setCurrentUserId,
    syncElements,
    upsertRemoteCursor,
    upsertRemoteElement
  ]);

  return useMemo(
    () => ({
      emitDraw(element: WhiteboardElement) {
        socketRef.current?.emit("draw", { boardId, element });
      },
      emitElementUpdate(element: WhiteboardElement) {
        socketRef.current?.emit("update-element", { boardId, element });
      },
      // A6.3: Cursor throttle with trailing send guarantee
      emitCursor(cursor: Omit<CursorPosition, "userId">) {
        queuedCursorRef.current = cursor;

        const scheduleTrailingSend = (delayMs: number) => {
          if (trailingTimerRef.current !== null) return;
          trailingTimerRef.current = window.setTimeout(() => {
            trailingTimerRef.current = null;
            if (queuedCursorRef.current && socketRef.current) {
              socketRef.current.emit("cursor-position", {
                boardId,
                cursor: queuedCursorRef.current
              });
              lastCursorSentRef.current = Date.now();
            }
          }, Math.max(0, delayMs));
        };

        if (cursorFrameRef.current !== null) {
          return;
        }

        cursorFrameRef.current = window.requestAnimationFrame(() => {
          cursorFrameRef.current = null;
          const now = Date.now();
          const elapsed = now - lastCursorSentRef.current;

          if (elapsed >= THROTTLE_MS) {
            if (queuedCursorRef.current && socketRef.current) {
              socketRef.current.emit("cursor-position", {
                boardId,
                cursor: queuedCursorRef.current
              });
              lastCursorSentRef.current = now;
            }
          } else {
            scheduleTrailingSend(THROTTLE_MS - elapsed);
          }
        });
      },
      emitClear() {
        socketRef.current?.emit("clear-board", { boardId });
      },
      emitDeleteBoard() {
        socketRef.current?.emit("delete-board", { boardId });
      },
      emitReplace(elements: WhiteboardElement[]) {
        const version = useBoardStore.getState().version;
        socketRef.current?.emit("replace-elements", { boardId, elements, version });
      },
      emitLaser(point: { x: number; y: number }, color?: string) {
        socketRef.current?.emit("laser-point", { boardId, point, color });
      },
      emitUpdateUserName(name: string) {
        if (typeof window !== "undefined") {
          localStorage.setItem("whiteboard_user_name", name);
        }
        socketRef.current?.emit("update-user-name", { boardId, name });
      }
    }),
    [boardId]
  );
}
