"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const mongoose_1 = __importDefault(require("mongoose"));
const socket_io_1 = require("socket.io");
const board_1 = require("./routes/board");
const board_socket_1 = require("./sockets/board.socket");
const env_1 = require("./utils/env");
async function start() {
    await mongoose_1.default.connect(env_1.env.mongoUri);
    const app = (0, express_1.default)();
    const corsOptions = {
        origin(origin, callback) {
            if (!origin || env_1.env.clientOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`Origin ${origin} is not allowed by CORS.`));
        }
    };
    app.use((0, cors_1.default)(corsOptions));
    app.use(express_1.default.json({ limit: "2mb" }));
    app.use("/board", board_1.boardRouter);
    app.get("/health", (_request, response) => {
        response.json({ ok: true });
    });
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, {
        cors: corsOptions
    });
    io.on("connection", (socket) => {
        (0, board_socket_1.registerBoardSocket)(io, socket);
    });
    server.listen(env_1.env.port, () => {
        console.log(`Server listening on http://localhost:${env_1.env.port}`);
        console.log(`Allowed client origins: ${env_1.env.clientOrigins.join(", ")}`);
    });
}
void start().catch((error) => {
    console.error("Failed to start server.");
    console.error(error);
    process.exit(1);
});
