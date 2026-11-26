"use client";

import { useBoardStore, registerResyncHandler } from "@/store/boardStore";
import { clearToken, getToken } from "@/lib/boardAuth";
import { removeRecentBoard } from "@/lib/recentBoards";
import type {
  CursorPosition, DrawEventPayload, DrawProgressPayload, Point, PresenceUser, WhiteboardElement
} from "@shared/types";
import type { Socket } from "socket.io-client";
import { useEffect, useMemo, useRef } from "react";

const getSocketUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (envUrl) return envUrl;
  return `${window.location.protocol}//${window.location.hostname}:4001`;
};

let localUserId: string | undefined;

function getLocalUserId() {
  localUserId ??= typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "u_" + Math.random().toString(36).substring(2, 11);
  return localUserId;
}

function getStoredName() {
  return sessionStorage.getItem("whiteboard_user_name") || localStorage.getItem("whiteboard_user_name");
}

type StrokeProgress = Omit<DrawProgressPayload, "boardId">;
type StateMessage = { boardId: string; title?: string; elements: WhiteboardElement[]; deletedIds?: string[]; version?: number };

export function useSocket(boardId: string, options?: {
  enabled?: boolean;
  onJoinDenied?: (code: string) => void;
  onTitleChange?: (title: string) => void;
}) {
  const enabled = options?.enabled ?? true;
  const onJoinDenied = useRef(options?.onJoinDenied);
  onJoinDenied.current = options?.onJoinDenied;
  const onTitleChange = useRef(options?.onTitleChange);
  onTitleChange.current = options?.onTitleChange;
  const connectionRef = useRef<{ socket: Socket; boardId: string; joined: boolean } | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastResyncRef = useRef(0);
  const queueRef = useRef({
    cursor: null as Omit<CursorPosition, "userId"> | null,
    laser: null as { point: Point; color?: string } | null,
    updates: new Map<string, WhiteboardElement>(),
    strokes: new Map<string, StrokeProgress>(),
    announced: new WeakSet<WhiteboardElement>(),
    announcedDeletes: new Set<string>()
  });

  const collaboration = useMemo(() => {
    function joinedSocket() {
      const connection = connectionRef.current;
      return connection?.boardId === boardId && connection.joined && connection.socket.connected
        ? connection.socket
        : undefined;
    }

    function flushPointerUpdates() {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      const queue = queueRef.current;
      const socket = joinedSocket();
      if (socket) {
        if (queue.cursor) socket.volatile.emit("cursor-position", { boardId, cursor: queue.cursor });
        if (queue.laser) socket.volatile.emit("laser-point", { boardId, ...queue.laser });
        for (const progress of queue.strokes.values()) socket.emit("draw-progress", { boardId, ...progress });
        if (queue.updates.size === 1) {
          socket.emit("update-element", { boardId, element: queue.updates.values().next().value });
        } else if (queue.updates.size > 1) {
          socket.emit("replace-elements", { boardId, elements: Array.from(queue.updates.values()), preview: true });
        }
      }
      queue.cursor = null;
      queue.laser = null;
      queue.strokes.clear();
      queue.updates.clear();
    }

    function scheduleFrame() {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flushPointerUpdates);
    }

    function emitReplace(_elements?: WhiteboardElement[], replay = false) {
      if (useBoardStore.getState().isLocked) return;
      const socket = joinedSocket();
      if (!socket) return;
      const queue = queueRef.current;
      const { pendingLocalChanges, activeElementIds, editingElementId } = useBoardStore.getState();
      const elements: WhiteboardElement[] = [];
      const deletedIds: string[] = [];
      for (const [id, element] of pendingLocalChanges) {
        if (element) {
          if (!replay && (activeElementIds.has(id) || id === editingElementId)) continue;
          if (!queue.announced.has(element)) {
            queue.updates.delete(id);
            queue.strokes.delete(id);
            elements.push(element);
            queue.announced.add(element);
          }
        } else if (!queue.announcedDeletes.has(id)) {
          queue.updates.delete(id);
          queue.strokes.delete(id);
          deletedIds.push(id);
          queue.announcedDeletes.add(id);
        }
      }
      if (elements.length || deletedIds.length) {
        socket.emit("replace-elements", { boardId, elements, deletedIds, preview: true });
      }
    }

    return {
      flushPointerUpdates,
      emitDraw(element: WhiteboardElement) {
        if (useBoardStore.getState().isLocked) return;
        const socket = joinedSocket();
        if (!socket) return;
        const queue = queueRef.current;
        // The full stroke at pointer-up supersedes any points still queued.
        queue.strokes.delete(element.id);
        queue.updates.delete(element.id);
        queue.announced.add(element);
        socket.emit("draw", { boardId, element });
      },
      emitDrawProgress(progress: StrokeProgress) {
        if (!joinedSocket() || useBoardStore.getState().isLocked || progress.points.length === 0) return;
        const { strokes } = queueRef.current;
        const previous = strokes.get(progress.elementId);
        strokes.set(progress.elementId, previous
          ? { ...progress, points: [...previous.points, ...progress.points] }
          : progress);
        scheduleFrame();
      },
      emitElementUpdate(element: WhiteboardElement) {
        if (!joinedSocket() || useBoardStore.getState().isLocked) return;
        queueRef.current.updates.set(element.id, element);
        scheduleFrame();
      },
      emitCursor(cursor: Omit<CursorPosition, "userId">) {
        if (!joinedSocket()) return;
        queueRef.current.cursor = cursor;
        scheduleFrame();
      },
      emitCursorLeave() {
        queueRef.current.cursor = null;
        joinedSocket()?.emit("cursor-leave", { boardId });
      },
      emitClear: () => emitReplace(),
      emitReplace,
      emitLaser(point: Point, color?: string) {
        if (!joinedSocket() || useBoardStore.getState().isLocked) return;
        queueRef.current.laser = { point, color };
        scheduleFrame();
      },
      emitUpdateUserName(name: string) {
        sessionStorage.setItem("whiteboard_user_name", name);
        localStorage.setItem("whiteboard_user_name", name);
        joinedSocket()?.emit("update-user-name", { boardId, name });
      },
      requestResync() {
        const socket = joinedSocket();
        const now = Date.now();
        if (!socket || now - lastResyncRef.current < 2000) return;
        lastResyncRef.current = now;
        socket.emit("request-state", { boardId });
      }
    };
  }, [boardId]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let socket: Socket | undefined;
    let retryTimer: number | undefined;
    const queue = queueRef.current;
    registerResyncHandler(collaboration.requestResync);

    function resetQueue() {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      queue.cursor = queue.laser = null;
      queue.updates.clear();
      queue.strokes.clear();
      queue.announced = new WeakSet();
      queue.announcedDeletes.clear();
    }

    void import("socket.io-client").then(({ io }) => {
      if (!active) return;
      const state = useBoardStore.getState;
      const userId = getLocalUserId();
      state().setCurrentUserId(userId);
      const activeSocket = io(getSocketUrl(), {
        autoConnect: false,
        transports: ["websocket", "polling"],
        tryAllTransports: true,
        reconnectionDelay: 300,
        reconnectionDelayMax: 2000,
        randomizationFactor: 0.3,
        auth: { userId }
      });
      socket = activeSocket;
      const connection = { socket: activeSocket, boardId, joined: false };
      connectionRef.current = connection;

      let nameAtJoin: string | null = null;

      function join() {
        if (activeSocket.connected) {
          nameAtJoin = getStoredName();
          activeSocket.emit("join-board", { boardId, userName: nameAtJoin, token: getToken(boardId) });
        }
      }

      activeSocket.on("connect", join);
      activeSocket.on("disconnect", () => {
        connection.joined = false;
        resetQueue();
        state().setPresenceUsers([]);
      });
      activeSocket.on("join-unavailable", ({ boardId: unavailableId }) => {
        if (unavailableId !== boardId) return;
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(join, 2000);
      });
      activeSocket.on("join-denied", ({ boardId: deniedId, code }) => {
        if (deniedId !== boardId) return;
        window.clearTimeout(retryTimer);
        connection.joined = false;
        state().setIsLocked(true);
        onJoinDenied.current?.(code);
      });
      activeSocket.on("board:state", (message: StateMessage) => {
        if (message.boardId !== boardId) return;
        window.clearTimeout(retryTimer);
        state().mergeRemoteElements(message.elements, message.deletedIds, message.version, "snapshot");
        if (message.title) onTitleChange.current?.(message.title);
        const wasJoined = connection.joined;
        connection.joined = true;
        if (!wasJoined) {
          const name = getStoredName();
          if (name && name !== nameAtJoin) {
            activeSocket.emit("update-user-name", { boardId, name });
          }
          collaboration.emitReplace(undefined, true);
        }
      });
      activeSocket.on("board:renamed", ({ boardId: target, title }: { boardId: string; title: string }) => {
        if (target === boardId) onTitleChange.current?.(title);
      });
      activeSocket.on("board:committed", (message: StateMessage) => {
        if (message.boardId === boardId) {
          state().mergeRemoteElements(message.elements, message.deletedIds, message.version, "committed");
        }
      });
      activeSocket.on("replace-elements", (message: StateMessage) => {
        if (message.boardId === boardId) {
          state().mergeRemoteElements(message.elements, message.deletedIds, message.version);
        }
      });
      const upsert = ({ boardId: target, element }: DrawEventPayload) => {
        if (target === boardId) state().upsertRemoteElement(element);
      };
      activeSocket.on("draw", upsert);
      activeSocket.on("update-element", upsert);
      activeSocket.on("draw-progress", ({ boardId: target, elementId, points, x, y, width, height }: DrawProgressPayload) => {
        if (target === boardId) state().appendRemotePoints(elementId, points, { x, y, width, height });
      });
      activeSocket.on("cursor-position", ({ boardId: target, cursor }: { boardId: string; cursor: CursorPosition }) => {
        if (target === boardId) state().upsertRemoteCursor(cursor);
      });
      activeSocket.on("cursor-leave", ({ boardId: target, userId: departed }) => {
        if (target === boardId) state().removeRemoteCursor(departed);
      });
      activeSocket.on("presence:state", ({ boardId: target, users }: { boardId: string; users: PresenceUser[] }) => {
        if (target === boardId) state().setPresenceUsers(users);
      });
      activeSocket.on("clear-board", () => state().applyRemoteClear());
      activeSocket.on("board-deleted", ({ boardId: target }: { boardId: string }) => {
        if (target !== boardId) return;
        removeRecentBoard(boardId);
        clearToken(boardId);
        // Navigation after a confirmed delete should bypass the unsaved-work guard.
        state().loadBoard([]);
        window.location.replace("/");
      });
      activeSocket.on("laser-point", ({ boardId: target, point, color }) => {
        if (target === boardId) state().addLaserPoint(point, color);
      });
      activeSocket.connect();
    });

    const cursorCleanup = window.setInterval(() => useBoardStore.getState().cleanStaleCursors(), 2500);
    return () => {
      active = false;
      window.clearInterval(cursorCleanup);
      window.clearTimeout(retryTimer);
      registerResyncHandler(null);
      resetQueue();
      lastResyncRef.current = 0;
      socket?.removeAllListeners();
      socket?.disconnect();
      if (connectionRef.current?.boardId === boardId) connectionRef.current = null;
    };
  }, [boardId, collaboration, enabled]);

  return collaboration;
}
