import type { Server, Socket } from "socket.io";
import { getBoard, updateBoard, deleteBoard } from "../services/board.service";
import type { PresenceUser, WhiteboardElement } from "@shared/types";

const PALETTE = [
  "#f43f5e", // Rose
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#3b82f6", // Blue
  "#14b8a6", // Teal
  "#eab308"  // Yellow
];

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getUserId(socket: Socket): string {
  const requested = socket.handshake.auth.userId || socket.handshake.query.userId;
  return typeof requested === "string" && requested ? requested : socket.id;
}

function getUserName(userId: string): string {
  return `User-${userId.slice(0, 4)}`;
}

function getUserColor(userId: string): string {
  const idx = Math.abs(stringHash(userId)) % PALETTE.length;
  return PALETTE[idx];
}

// Track presence: boardId -> Map<socketId, PresenceUser>
const roomUsers = new Map<string, Map<string, PresenceUser>>();

export function registerBoardSocket(io: Server, socket: Socket) {
  const userId = getUserId(socket);
  const userColor = getUserColor(userId);
  const userName = (socket.handshake.auth.name as string) || getUserName(userId);

  const identity: PresenceUser = {
    userId,
    name: userName,
    color: userColor
  };

  // Send identity confirmation to this connected client
  socket.emit("identity", identity);

  let currentBoardId: string | null = null;

  socket.on(
    "join-board",
    async ({
      boardId,
      userName: customName,
      role
    }: {
      boardId: string;
      userName?: string;
      role?: string;
    }) => {
      if (!boardId || typeof boardId !== "string") return;

      if (role === "viewer" || socket.handshake.auth.role === "viewer") {
        socket.data.isViewer = true;
      }

      if (customName && typeof customName === "string" && customName.trim()) {
        identity.name = customName.trim();
      }

      if (currentBoardId && currentBoardId !== boardId) {
        leaveBoard(currentBoardId);
      }

      currentBoardId = boardId;
      socket.join(boardId);

      if (!roomUsers.has(boardId)) {
        roomUsers.set(boardId, new Map());
      }
    const boardPresence = roomUsers.get(boardId)!;
    boardPresence.set(socket.id, identity);

    // Broadcast full authoritative room presence to all connected sockets in this board
    io.to(boardId).emit("presence:state", {
      boardId,
      users: Array.from(boardPresence.values())
    });

    // Notify room of new user for listeners that handle individual delta events
    socket.to(boardId).emit("presence:join", {
      boardId,
      user: identity
    });

    // Provide latest authoritative board state on join/reconnect
    try {
      const board = await getBoard(boardId);
      if (board) {
        socket.emit("board:state", {
          boardId,
          version: board.version,
          elements: board.elements
        });
      }
    } catch {
      // ignore
    }
  });

  socket.on("request-presence", ({ boardId }: { boardId: string }) => {
    if (!boardId) return;
    const boardPresence = roomUsers.get(boardId);
    if (boardPresence) {
      socket.emit("presence:state", {
        boardId,
        users: Array.from(boardPresence.values())
      });
    }
  });

  socket.on("request-state", async ({ boardId }: { boardId: string }) => {
    const boardPresence = roomUsers.get(boardId);
    if (boardPresence) {
      socket.emit("presence:state", {
        boardId,
        users: Array.from(boardPresence.values())
      });
    }
    try {
      const board = await getBoard(boardId);
      if (board) {
        socket.emit("board:state", {
          boardId,
          version: board.version,
          elements: board.elements
        });
      }
    } catch {
      // ignore
    }
  });

  function leaveBoard(boardId: string) {
    socket.leave(boardId);
    const boardPresence = roomUsers.get(boardId);
    if (boardPresence) {
      boardPresence.delete(socket.id);
      if (boardPresence.size === 0) {
        roomUsers.delete(boardId);
      } else {
        io.to(boardId).emit("presence:state", {
          boardId,
          users: Array.from(boardPresence.values())
        });
      }
    }

    // Only broadcast presence:leave if there are NO remaining sockets for this userId in the room
    const hasRemainingSocketForUser = boardPresence
      ? Array.from(boardPresence.values()).some((u) => u.userId === userId)
      : false;

    if (!hasRemainingSocketForUser) {
      socket.to(boardId).emit("presence:leave", { boardId, userId });
      socket.to(boardId).emit("cursor-leave", { boardId, userId });
    }
  }

  socket.on("leave-board", ({ boardId }: { boardId: string }) => {
    if (boardId) {
      leaveBoard(boardId);
      if (currentBoardId === boardId) currentBoardId = null;
    }
  });

  socket.on("draw", ({ boardId, element }) => {
    if (socket.data.isViewer) return;
    if (!boardId || !element) return;
    socket.to(boardId).emit("draw", { boardId, element });
  });

  socket.on("update-element", ({ boardId, element }) => {
    if (socket.data.isViewer) return;
    if (!boardId || !element) return;
    socket.to(boardId).emit("update-element", { boardId, element });
  });

  socket.on("update-user-name", ({ boardId, name }: { boardId?: string; name: string }) => {
    const targetBoardId = boardId || currentBoardId;
    if (name && typeof name === "string" && name.trim()) {
      identity.name = name.trim();
      if (targetBoardId && roomUsers.has(targetBoardId)) {
        roomUsers.get(targetBoardId)!.set(socket.id, identity);
        io.to(targetBoardId).emit("presence:state", {
          boardId: targetBoardId,
          users: Array.from(roomUsers.get(targetBoardId)!.values())
        });
        socket.to(targetBoardId).emit("presence:join", {
          boardId: targetBoardId,
          user: identity
        });
      }
    }
  });

  socket.on(
    "cursor-position",
    ({ boardId, cursor }: { boardId: string; cursor: { x: number; y: number; name?: string } }) => {
      if (!boardId || !cursor) return;
      socket.to(boardId).emit("cursor-position", {
        boardId,
        cursor: {
          x: cursor.x,
          y: cursor.y,
          userId,
          color: userColor,
          name: cursor.name || identity.name,
          lastSeen: Date.now()
        }
      });
    }
  );

  socket.on("clear-board", async ({ boardId }: { boardId: string }) => {
    if (socket.data.isViewer) return;
    if (!boardId) return;
    socket.to(boardId).emit("clear-board");
    try {
      const updated = await updateBoard(boardId, []);
      io.to(boardId).emit("replace-elements", {
        boardId,
        elements: [],
        version: updated.version
      });
    } catch {
      // ignore
    }
  });

  socket.on("delete-board", async ({ boardId }: { boardId: string }) => {
    if (socket.data.isViewer) return;
    if (!boardId) return;
    socket.to(boardId).emit("board-deleted", { boardId });
    try {
      await deleteBoard(boardId);
    } catch {
      // ignore
    }
  });

  socket.on(
    "replace-elements",
    async ({
      boardId,
      elements,
      version,
      deletedIds
    }: {
      boardId: string;
      elements: unknown[];
      version?: number;
      deletedIds?: string[];
    }) => {
      if (socket.data.isViewer) return;
      if (!boardId || !Array.isArray(elements)) return;
      const tombstones = Array.isArray(deletedIds) ? deletedIds : [];
      try {
        const updated = await updateBoard(
          boardId,
          elements as WhiteboardElement[],
          undefined,
          tombstones
        );
        io.to(boardId).emit("replace-elements", {
          boardId,
          elements: updated.elements,
          version: updated.version,
          deletedIds: updated.deletedElementIds || tombstones
        });
      } catch {
        socket.to(boardId).emit("replace-elements", {
          boardId,
          elements,
          deletedIds: tombstones,
          version: (version ?? 0) + 1
        });
      }
    }
  );

  socket.on(
    "laser-point",
    ({ boardId, point, color }: { boardId: string; point: { x: number; y: number }; color: string }) => {
      if (!boardId || !point) return;
      socket.to(boardId).emit("laser-point", { point, color: color || userColor });
    }
  );

  socket.on("disconnect", () => {
    if (currentBoardId) {
      leaveBoard(currentBoardId);
      currentBoardId = null;
    }
  });
}
