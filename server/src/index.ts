import cors from "cors";
import express from "express";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { boardRouter } from "./routes/board";
import { aiRouter } from "./routes/ai";
import { registerBoardSocket } from "./sockets/board.socket";
import { env } from "./utils/env";

async function start() {
  await mongoose.connect(env.mongoUri);

  const app = express();

  const corsOptions = {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || env.clientOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    }
  };

  app.use(
    cors(corsOptions)
  );
  app.use(express.json({ limit: "10mb" }));
  app.use("/board", boardRouter);
  app.use("/ai", aiRouter);
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOptions
  });

  io.on("connection", (socket) => {
    registerBoardSocket(io, socket);
  });

  server.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
    console.log(`Allowed client origins: ${env.clientOrigins.join(", ")}`);
  });
}

void start().catch((error) => {
  console.error("Failed to start server.");
  console.error(error);
  process.exit(1);
});
