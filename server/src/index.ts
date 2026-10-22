import cors from "cors";
import express from "express";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { boardRouter } from "./routes/board";
import { aiRouter } from "./routes/ai";
import { registerBoardSocket } from "./sockets/board.socket";
import { env } from "./utils/env";
import { getUploadsDir } from "./utils/storage";

async function start() {
  // Connect to MongoDB asynchronously with auto-retry (keeps server alive if offline/network issue)
  const connectMongo = async () => {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log("Connected to MongoDB successfully");
    } catch (err: any) {
      console.warn(`MongoDB notice: ${err?.message || err}. Running with in-memory fallback while reconnecting...`);
      setTimeout(connectMongo, 10000);
    }
  };
  void connectMongo();

  const app = express();

  const corsOptions = {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || env.clientOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Allow localhost / 127.0.0.1 on any port, or local LAN IP addresses (192.168.x, 10.x, 172.x)
      if (
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true
  };

  // Security headers (A5.4)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  app.use(cors(corsOptions));
  // Defensible 5mb payload limit instead of 100mb now that base64 images are persisted (A1.5)
  app.use(express.json({ limit: "5mb" }));

  // Static uploads directory for persisted images with open CORS for canvas rendering (A1.3)
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(getUploadsDir())
  );

  app.use("/board", boardRouter);
  app.use("/ai", aiRouter);

  // Liveness check
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  // Readiness check that verifies MongoDB connection (A8.5)
  app.get("/health/ready", async (_request, response) => {
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (!isMongoConnected) {
      response.status(503).json({ ready: false, mongo: "disconnected" });
      return;
    }
    try {
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      }
      response.json({ ready: true, mongo: "connected" });
    } catch (err: any) {
      response.status(503).json({ ready: false, mongo: err?.message || "ping failed" });
    }
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOptions,
    maxHttpBufferSize: 5e6
  });

  io.on("connection", (socket) => {
    registerBoardSocket(io, socket);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️  Port ${env.port} is already in use. Terminate the existing process on port ${env.port} or change PORT in server/.env.`);
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
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
