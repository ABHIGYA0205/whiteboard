import type { Server, Socket } from "socket.io";
import { getBoard } from "../services/board.service";
import type { PresenceUser } from "@shared/types";

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

  socket.on("join-board", async ({ boardId, userName: customName }: { boardId: string; userName?: string }) => {
    if (!boardId || typeof boardId !== "string") return;

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

    // Notify room of new user
    socket.to(boardId).emit("presence:join", {
      boardId,
      user: identity
    });

    // Send full current room presence list to the joining socket
    socket.emit("presence:state", {
      boardId,
      users: Array.from(boardPresence.values())
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

  socket.on("request-state", async ({ boardId }: { boardId: string }) => {
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
      }
    }
    socket.to(boardId).emit("presence:leave", { boardId, userId });
    socket.to(boardId).emit("cursor-leave", { boardId, userId });
  }

  socket.on("leave-board", ({ boardId }: { boardId: string }) => {
    if (boardId) {
      leaveBoard(boardId);
      if (currentBoardId === boardId) currentBoardId = null;
    }
  });

  socket.on("draw", ({ boardId, element }) => {
    if (!boardId || !element) return;
    socket.to(boardId).emit("draw", { boardId, element });
  });

  socket.on("update-element", ({ boardId, element }) => {
    if (!boardId || !element) return;
    socket.to(boardId).emit("update-element", { boardId, element });
  });

  socket.on("update-user-name", ({ name }: { name: string }) => {
    if (name && typeof name === "string" && name.trim()) {
      identity.name = name.trim();
      if (currentBoardId && roomUsers.has(currentBoardId)) {
        roomUsers.get(currentBoardId)!.set(socket.id, identity);
        io.to(currentBoardId).emit("presence:state", {
          boardId: currentBoardId,
          users: Array.from(roomUsers.get(currentBoardId)!.values())
        });
      }
    }
  });

  socket.on(
    "cursor-position",
    ({ boardId, cursor }: { boardId: string; cursor: { x: number; y: number } }) => {
      if (!boardId || !cursor) return;
      socket.to(boardId).emit("cursor-position", {
        boardId,
        cursor: {
          x: cursor.x,
          y: cursor.y,
          userId,
          color: userColor,
          name: identity.name,
          lastSeen: Date.now()
        }
      });
    }
  );

  socket.on("clear-board", ({ boardId }: { boardId: string }) => {
    if (!boardId) return;
    socket.to(boardId).emit("clear-board");
  });

  socket.on(
    "replace-elements",
    ({ boardId, elements }: { boardId: string; elements: unknown[] }) => {
      if (!boardId || !Array.isArray(elements)) return;
      socket.to(boardId).emit("replace-elements", { boardId, elements });
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
