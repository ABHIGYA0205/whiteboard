"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBoardSocket = registerBoardSocket;
function getUserId(socket) {
    const requested = socket.handshake.auth.userId || socket.handshake.query.userId;
    return typeof requested === "string" && requested ? requested : socket.id;
}
function registerBoardSocket(io, socket) {
    socket.on("join-board", ({ boardId }) => {
        socket.join(boardId);
    });
    socket.on("leave-board", ({ boardId }) => {
        socket.leave(boardId);
    });
    socket.on("draw", ({ boardId, element }) => {
        socket.to(boardId).emit("draw", { boardId, element });
    });
    socket.on("update-element", ({ boardId, element }) => {
        socket.to(boardId).emit("update-element", { boardId, element });
    });
    socket.on("cursor-position", ({ boardId, cursor }) => {
        socket.to(boardId).emit("cursor-position", {
            boardId,
            cursor: {
                ...cursor,
                userId: getUserId(socket)
            }
        });
    });
    socket.on("clear-board", ({ boardId }) => {
        socket.to(boardId).emit("clear-board");
    });
    socket.on("replace-elements", ({ boardId, elements }) => {
        socket.to(boardId).emit("replace-elements", { boardId, elements });
    });
}
