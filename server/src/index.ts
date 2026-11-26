import cors from "cors";
import express from "express";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { boardRouter } from "./routes/board";
import { aiRouter } from "./routes/ai";
import { registerBoardSocket } from "./sockets/board.socket";
import { env } from "./utils/env";
import {
  getUploadsDir,
  getActiveStorageBackend,
  getStorageFallbacks,
  getActiveS3Config,
  warnIfLocalStorage
} from "./utils/storage";

async function start() {
  // Connect to MongoDB asynchronously with auto-retry (keeps server alive if offline/network issue)
  const connectMongo = async () => {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log("Connected to MongoDB successfully");
    } catch (err: any) {
      console.warn(`MongoDB unavailable: ${err?.message || err}. Retrying connection.`);
      setTimeout(connectMongo, 10000);
    }
  };
  void connectMongo();

  const app = express();
  app.disable("x-powered-by");

  const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin || env.clientOrigins.includes(origin)) return true;
    if (process.env.NODE_ENV === "production") return false;
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);
  };

  const corsOptions = {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(Object.assign(new Error("Origin is not allowed."), { status: 403 }));
    },
    credentials: true,
    exposedHeaders: ["Retry-After"]
  };

  // Security headers (A5.4)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Static uploads directory for persisted images with open CORS for canvas rendering (A1.3)
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      next();
    },
    cors({ origin: "*", methods: ["GET", "HEAD", "OPTIONS"] }),
    express.static(getUploadsDir(), { fallthrough: false })
  );

  app.use(cors(corsOptions));
  // Allow an 8 MB image to reach the handler after base64 encoding.
  app.use(express.json({ limit: "12mb" }));

  app.use("/board", boardRouter);
  app.use("/ai", aiRouter);

  // Liveness check
  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      storage: getActiveStorageBackend(),
      storageFallbacks: getStorageFallbacks()
    });
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

  // Global JSON error handler preventing express HTML error pages from leaking
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err?.type === "entity.too.large" || err?.status === 413) {
      res.status(413).json({
        error: "Payload too large",
        code: "PAYLOAD_TOO_LARGE"
      });
      return;
    }
    if (err?.status === 400 || err?.type === "entity.parse.failed") {
      res.status(400).json({
        error: err.message || "Invalid JSON payload",
        code: "INVALID_REQUEST"
      });
      return;
    }
    res.status(err?.status || 500).json({
      error: err?.message || "Internal server error",
      code: err?.code || "INTERNAL_ERROR"
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOptions,
    allowRequest: (request, callback) => callback(null, isAllowedOrigin(request.headers.origin)),
    maxHttpBufferSize: 5e6,
    // Heartbeat must survive a busy event loop. These were 2500/3000, which
    // meant a 3 s stall (large board autosave, slow Mongo, CPU-starved free
    // instance, background-tab timer throttling) silently killed the socket —
    // and with it all live collaboration, until the user reloaded the page.
    pingInterval: 25000,
    pingTimeout: 20000
  });

  app.set("socket.io", io);

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

  server.listen(env.port, process.env.HOST || "0.0.0.0", () => {
    console.log(`Server listening on http://localhost:${env.port}`);
    console.log(`Allowed client origins: ${env.clientOrigins.join(", ")}`);
    warnIfLocalStorage();
    const backend = getActiveStorageBackend();
    if (backend === "vercel-blob") {
      console.log("Storage backend: vercel-blob");
    } else if (backend === "s3") {
      console.log(`Storage backend: s3 (bucket: ${getActiveS3Config().bucket})`);
    } else {
      console.log("Storage backend: local");
    }
  });
}

void start().catch((error) => {
  console.error("Failed to start server.");
  console.error(error);
  process.exit(1);
});
