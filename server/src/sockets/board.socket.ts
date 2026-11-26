import type { Server, Socket } from "socket.io";
import { getBoard, updateBoard, deleteBoard, hasValidTokenOwner } from "../services/board.service";
import { verifyBoardToken, type BoardRole } from "../utils/token";
import { isBoardElement, isElementId, isPoint } from "../utils/boardPayload";
import type { BoardDocument, DrawProgressPayload, PresenceUser, WhiteboardElement } from "@shared/types";

const PALETTE = ["#f43f5e", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#14b8a6", "#eab308"];

function colorFor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (31 * hash + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

type LiveBoard = {
  users: Map<string, PresenceUser>;
  previews: Map<string, WhiteboardElement>;
  deletedIds: Set<string>;
  version: number;
  idleTimer?: ReturnType<typeof setTimeout>;
};

const liveBoards = new Map<string, LiveBoard>();
const roomName = (boardId: string) => `board:${boardId}`;

function publishPresence(io: Server, boardId: string, room: LiveBoard) {
  const users = new Map(Array.from(room.users.values(), (user) => [user.userId, user]));
  io.to(roomName(boardId)).emit("presence:state", { boardId, users: Array.from(users.values()) });
}

export function publishBoardUpdate(io: Server, board: BoardDocument, changedIds: Iterable<string>) {
  const room = liveBoards.get(board.id);
  if (!room) return;

  const changed = new Set(changedIds);
  const deleted = new Set(board.deletedElementIds ?? []);
  const deletedIds = Array.from(changed).filter((id) => deleted.has(id));
  const elements = board.elements.filter((element) => changed.has(element.id));

  // A storage write confirms these ids. Keep other in-progress previews in the
  // room, including strokes that did not exist when the save started.
  room.version = Math.max(room.version, board.version);
  for (const id of changed) room.previews.delete(id);
  for (const id of deletedIds) room.deletedIds.add(id);
  io.to(roomName(board.id)).emit("board:committed", { boardId: board.id, elements, deletedIds, version: board.version });
}

export function publishBoardDeletion(io: Server, boardId: string) {
  const room = liveBoards.get(boardId);
  if (room?.idleTimer) clearTimeout(room.idleTimer);
  liveBoards.delete(boardId);
  io.to(roomName(boardId)).emit("board-deleted", { boardId });
  io.in(roomName(boardId)).socketsLeave(roomName(boardId));
}

export function publishBoardRename(io: Server, boardId: string, title: string) {
  io.to(roomName(boardId)).emit("board:renamed", { boardId, title });
}

export function publishBoardClaim(io: Server, boardId: string) {
  const room = liveBoards.get(boardId);
  if (!room) return;
  if (room.idleTimer) clearTimeout(room.idleTimer);
  liveBoards.delete(boardId);
  io.to(roomName(boardId)).emit("join-denied", { boardId, code: "TOKEN_REQUIRED" });
  io.in(roomName(boardId)).socketsLeave(roomName(boardId));
}

export function registerBoardSocket(io: Server, socket: Socket) {
  const requestedId = socket.handshake.auth.userId || socket.handshake.query.userId;
  const userId = isElementId(requestedId) ? requestedId : socket.id;
  const name = socket.handshake.auth.name;
  const identity: PresenceUser = {
    userId,
    name: (typeof name === "string" && name.trim().slice(0, 80)) || `User-${userId.slice(0, 4)}`,
    color: colorFor(userId)
  };
  socket.emit("identity", identity);

  let membership: { boardId: string; role: BoardRole; expiresAt?: number } | undefined;
  let joinAttempt = 0;

  function leaveBoard() {
    if (!membership) return;
    const { boardId } = membership;
    membership = undefined;
    void socket.leave(roomName(boardId));
    const room = liveBoards.get(boardId);
    if (!room?.users.delete(socket.id)) return;
    if (room.users.size > 0) {
      publishPresence(io, boardId, room);
    } else {
      // Give a reconnecting editor time to recover unpersisted live strokes.
      room.idleTimer = setTimeout(() => liveBoards.delete(boardId), 120_000);
      room.idleTimer.unref();
    }
  }

  function joinedRoom(boardId: unknown, mayWrite = false) {
    if (typeof boardId !== "string" || membership?.boardId !== boardId || !socket.rooms.has(roomName(boardId))) return;
    if (membership.expiresAt && membership.expiresAt <= Date.now()) {
      leaveBoard();
      socket.emit("join-denied", { boardId, code: "TOKEN_INVALID" });
      return;
    }
    if (mayWrite && membership.role === "viewer") return;
    return liveBoards.get(boardId);
  }

  function sendState(board: BoardDocument, room: LiveBoard) {
    const elements = new Map(board.elements.map((element) => [element.id, element]));
    for (const [id, element] of room.previews) elements.set(id, element);
    const deletedIds = new Set([...board.deletedElementIds ?? [], ...room.deletedIds]);
    for (const id of deletedIds) elements.delete(id);
    socket.emit("board:state", {
      boardId: board.id,
      title: board.title,
      elements: Array.from(elements.values()),
      deletedIds: Array.from(deletedIds),
      version: Math.max(board.version, room.version)
    });
  }

  // Ignore payloads without the object shape shared by all board events.
  socket.use(([, payload], next) => {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) next();
  });

  socket.on("join-board", async ({ boardId, userName, token }) => {
    if (!isElementId(boardId)) return;
    const attempt = ++joinAttempt;
    try {
      const board = await getBoard(boardId);
      if (!socket.connected || attempt !== joinAttempt) return;
      const candidate = token ?? socket.handshake.auth.token;
      const verified = verifyBoardToken(candidate, boardId);

      let denial: string | undefined;
      if (!board) denial = "BOARD_NOT_FOUND";
      else if (hasValidTokenOwner(board.ownerId) && !verified.valid) {
        denial = candidate ? "TOKEN_INVALID" : "TOKEN_REQUIRED";
      }
      if (!board || denial) {
        if (membership?.boardId === boardId) leaveBoard();
        socket.emit("join-denied", { boardId, code: denial });
        return;
      }

      if (membership?.boardId !== boardId) leaveBoard();
      membership = {
        boardId,
        role: verified.valid ? verified.payload.role : "editor",
        expiresAt: verified.valid ? verified.payload.exp * 1000 : undefined
      };
      if (typeof userName === "string" && userName.trim()) identity.name = userName.trim().slice(0, 80);
      void socket.join(roomName(boardId));

      let room = liveBoards.get(boardId);
      if (!room) {
        room = { users: new Map(), previews: new Map(), deletedIds: new Set(), version: board.version };
        liveBoards.set(boardId, room);
      }
      if (room.idleTimer) {
        clearTimeout(room.idleTimer);
        room.idleTimer = undefined;
      }
      for (const id of board.deletedElementIds ?? []) room.deletedIds.add(id);
      room.users.set(socket.id, { ...identity });
      sendState(board, room);
      publishPresence(io, boardId, room);
    } catch {
      if (socket.connected && attempt === joinAttempt) {
        socket.emit("join-unavailable", { boardId });
      }
    }
  });

  socket.on("request-presence", ({ boardId }) => {
    const room = joinedRoom(boardId);
    if (!room) return;
    socket.emit("presence:state", { boardId, users: Array.from(room.users.values()) });
  });

  socket.on("request-state", async ({ boardId }) => {
    const room = joinedRoom(boardId);
    if (!room) return;
    try {
      const board = await getBoard(boardId);
      if (board && joinedRoom(boardId) === room) sendState(board, room);
    } catch {
      socket.emit("join-unavailable", { boardId });
    }
  });

  socket.on("leave-board", ({ boardId }) => {
    joinAttempt++;
    if (boardId === membership?.boardId) leaveBoard();
  });

  for (const event of ["draw", "update-element"]) {
    socket.on(event, ({ boardId, element }) => {
      const room = joinedRoom(boardId, true);
      if (!room || !isBoardElement(element) || room.deletedIds.has(element.id)) return;
      room.previews.set(element.id, element);
      socket.to(roomName(boardId)).emit(event, { boardId, element });
    });
  }

  socket.on("draw-progress", ({ boardId, elementId, points, x, y, width, height }: DrawProgressPayload) => {
    const room = joinedRoom(boardId, true);
    const element = room?.previews.get(elementId);
    if (!element || element.type !== "pencil" || !Array.isArray(points) || points.length === 0 ||
        !points.every(isPoint) || ![x, y, width, height].every(Number.isFinite)) return;
    element.points ??= [];
    for (const point of points) element.points.push(point);
    Object.assign(element, { x, y, width, height });
    socket.to(roomName(boardId)).emit("draw-progress", { boardId, elementId, points, x, y, width, height });
  });

  socket.on("update-user-name", ({ boardId, name }) => {
    const target = boardId ?? membership?.boardId;
    const room = joinedRoom(target);
    if (!room || typeof name !== "string" || !name.trim()) return;
    identity.name = name.trim().slice(0, 80);
    room.users.set(socket.id, { ...identity });
    publishPresence(io, target, room);
  });

  socket.on("cursor-position", ({ boardId, cursor }) => {
    if (!joinedRoom(boardId) || !isPoint(cursor)) return;
    socket.to(roomName(boardId)).volatile.emit("cursor-position", {
      boardId, cursor: { x: cursor.x, y: cursor.y, ...identity }
    });
  });

  socket.on("cursor-leave", ({ boardId }) => {
    if (joinedRoom(boardId)) socket.to(roomName(boardId)).emit("cursor-leave", { boardId, userId });
  });

  socket.on("laser-point", ({ boardId, point, color }) => {
    if (!joinedRoom(boardId, true) || !isPoint(point)) return;
    socket.to(roomName(boardId)).volatile.emit("laser-point", {
      boardId, point, color: typeof color === "string" && color.length <= 64 ? color : identity.color
    });
  });

  socket.on("replace-elements", ({ boardId, elements, deletedIds = [], preview }) => {
    const room = joinedRoom(boardId, true);
    if (!room || !Array.isArray(elements) || !elements.every(isBoardElement) ||
        !Array.isArray(deletedIds) || !deletedIds.every(isElementId)) return;
    for (const id of deletedIds) {
      room.previews.delete(id);
      room.deletedIds.add(id);
    }
    const upserts = elements.filter((element) => !room.deletedIds.has(element.id));
    for (const element of upserts) room.previews.set(element.id, element);
    socket.to(roomName(boardId)).emit("replace-elements", { boardId, elements: upserts, deletedIds });

    if (preview !== true) {
      void updateBoard(boardId, upserts, undefined, deletedIds).then((board) => {
        publishBoardUpdate(io, board, [...upserts.map(({ id }) => id), ...deletedIds]);
        if (joinedRoom(boardId) === room) socket.emit("replace-elements", { boardId, elements: [], version: board.version });
      }).catch(() => {});
    }
  });

  // Retain support for older clients. The current client sends explicit
  // tombstones over the same delta path as any other edit.
  socket.on("clear-board", async ({ boardId }) => {
    const room = joinedRoom(boardId, true);
    if (!room) return;
    const ids = Array.from(room.previews.keys());
    try {
      const board = await getBoard(boardId);
      if (!board || joinedRoom(boardId, true) !== room) return;
      ids.push(...board.elements.map((element) => element.id));
      const updated = await updateBoard(boardId, [], undefined, ids);
      publishBoardUpdate(io, updated, ids);
      socket.to(roomName(boardId)).emit("replace-elements", { boardId, elements: [], deletedIds: ids, version: updated.version });
    } catch {}
  });

  socket.on("delete-board", async ({ boardId }) => {
    if (!joinedRoom(boardId, true) || membership?.role !== "owner") return;
    try {
      await deleteBoard(boardId);
      publishBoardDeletion(io, boardId);
    } catch {}
  });

  socket.on("disconnect", leaveBoard);
}
