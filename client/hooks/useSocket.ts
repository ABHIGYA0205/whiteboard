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

export const getLocalUserId = () => {
  if (typeof window === "undefined") return "temp_user";
  // Use sessionStorage so each tab/window has its own unique collaborator presence and live cursor
  let id = sessionStorage.getItem("whiteboard_user_id");
  if (!id) {
    id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "u_" + Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem("whiteboard_user_id", id);
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
  const mergeRemoteElements = useBoardStore((state) => state.mergeRemoteElements);
  const applyRemoteClear = useBoardStore((state) => state.applyRemoteClear);
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
      const storedName =
        typeof window !== "undefined"
          ? (sessionStorage.getItem("whiteboard_user_name") || localStorage.getItem("whiteboard_user_name"))
          : null;

      // Ensure local user ID is immediately registered in Zustand store
      setCurrentUserId(localId);

      activeSocket = io(getSocketUrl(), {
        autoConnect: true,
        transports: ["polling", "websocket"],
        auth: {
          userId: localId,
          name: storedName || undefined
        }
      });
      socketRef.current = activeSocket;

      const handleIdentity = (identity: PresenceUser) => {
        if (identity?.userId) {
          setCurrentUserId(identity.userId);
        }
      };

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
        if (cursor?.userId) {
          addPresenceUser({
            userId: cursor.userId,
            name: cursor.name || `User-${cursor.userId.slice(0, 4)}`,
            color: cursor.color || "#3b82f6"
          });
        }
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
        // Tombstone everything: a plain [] merge would let peers' stale copies
        // flow straight back in on the next snapshot.
        applyRemoteClear();
      };

      const handleReplace = ({
        elements,
        version,
        deletedIds
      }: {
        elements: WhiteboardElement[];
        version?: number;
        deletedIds?: string[];
      }) => {
        // A peer's board snapshot is a set of upserts, never a delete list.
        // Anything it omits (our newest stroke, our in-flight shape) stays.
        mergeRemoteElements(elements, deletedIds, version);
      };

      const handleBoardDeleted = () => {
        alert("This board has been deleted.");
        window.location.href = "/";
      };

      const handleLaser = ({ point, color }: { point: { x: number; y: number }; color: string }) => {
        useBoardStore.getState().addLaserPoint(point, color);
      };

      const handleConnectError = (err: Error) => {
        console.warn("Socket connection warning:", err.message);
      };

      // Register all listeners BEFORE emitting join/request-state
      activeSocket.on("identity", handleIdentity);
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
      activeSocket.on("connect_error", handleConnectError);

      // Initial join and state request
      const join = () => {
        const currentName =
          typeof window !== "undefined"
            ? (sessionStorage.getItem("whiteboard_user_name") || localStorage.getItem("whiteboard_user_name"))
            : null;
        activeSocket?.emit("join-board", { boardId, userName: currentName || undefined });
        activeSocket?.emit("request-state", { boardId });
      };

      activeSocket.on("connect", join);
      if (activeSocket.connected) {
        join();
      }

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
        activeSocket?.off("connect_error", handleConnectError);
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

    // Fast presence sync heartbeat and stale cursor cleanup (every 2.5s)
    const cleanupInterval = window.setInterval(() => {
      cleanStaleCursors();
      if (socketRef.current?.connected && boardId) {
        socketRef.current.emit("request-presence", { boardId });
      }
    }, 2500);

    // Immediate cleanup when tab or browser window is closed or navigated away from
    const handleBeforeUnload = () => {
      if (socketRef.current?.connected && boardId) {
        try {
          socketRef.current.emit("leave-board", { boardId });
          socketRef.current.disconnect();
        } catch {}
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      isMounted = false;
      cleanupSocket?.();
      window.clearInterval(cleanupInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
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
    mergeRemoteElements,
    applyRemoteClear,
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
        const { version, deletedElementIds } = useBoardStore.getState();
        socketRef.current?.emit("replace-elements", {
          boardId,
          elements,
          version,
          deletedIds: Array.from(deletedElementIds)
        });
      },
      emitLaser(point: { x: number; y: number }, color?: string) {
        socketRef.current?.emit("laser-point", { boardId, point, color });
      },
      emitUpdateUserName(name: string) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("whiteboard_user_name", name);
          localStorage.setItem("whiteboard_user_name", name);
        }
        socketRef.current?.emit("update-user-name", { boardId, name });
      }
    }),
    [boardId]
  );
}
