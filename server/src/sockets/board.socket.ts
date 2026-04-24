import type { Server, Socket } from "socket.io";

function getUserId(socket: Socket) {
  const requested = socket.handshake.auth.userId || socket.handshake.query.userId;
  return typeof requested === "string" && requested ? requested : socket.id;
}

export function registerBoardSocket(io: Server, socket: Socket) {
  socket.on("join-board", ({ boardId }: { boardId: string }) => {
    socket.join(boardId);
  });

  socket.on("leave-board", ({ boardId }: { boardId: string }) => {
    socket.leave(boardId);
  });

  socket.on("draw", ({ boardId, element }) => {
    socket.to(boardId).emit("draw", { boardId, element });
  });

  socket.on("update-element", ({ boardId, element }) => {
    socket.to(boardId).emit("update-element", { boardId, element });
  });

  socket.on(
    "cursor-position",
    ({ boardId, cursor }: { boardId: string; cursor: { x: number; y: number; color: string } }) => {
      socket.to(boardId).emit("cursor-position", {
        boardId,
        cursor: {
          ...cursor,
          userId: getUserId(socket)
        }
      });
    }
  );

  socket.on("clear-board", ({ boardId }: { boardId: string }) => {
    socket.to(boardId).emit("clear-board");
  });

  socket.on(
    "replace-elements",
    ({ boardId, elements }: { boardId: string; elements: unknown[] }) => {
      socket.to(boardId).emit("replace-elements", { boardId, elements });
    }
  );
}
