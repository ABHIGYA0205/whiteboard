import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

let randomBoardSecret: string | null = null;
let hasWarnedSecret = false;

function getBoardSecret(): string {
  const secret = process.env.BOARD_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (!randomBoardSecret) {
    randomBoardSecret = crypto.randomBytes(32).toString("hex");
    if (!hasWarnedSecret) {
      hasWarnedSecret = true;
      console.warn("⚠️  BOARD_SECRET unset; generated random secret for this session. Tokens will not survive a restart.");
    }
  }
  return randomBoardSecret;
}

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:3001"
];

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
}

function validateEnv() {
  const errors: string[] = [];

  const rawPort = process.env.PORT ?? "4001";
  const port = Number(rawPort);
  if (isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`Invalid PORT "${rawPort}". Must be a number between 1 and 65535.`);
  }

  const mongoUri = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/whiteboard";
  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    errors.push(`Invalid MONGO_URI "${mongoUri}". Must start with mongodb:// or mongodb+srv://`);
  }

  if (errors.length > 0) {
    console.error("❌ Environment validation failed:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  const configuredOrigins = (process.env.CLIENT_ORIGIN ?? defaultOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    mongoUri,
    hfToken: process.env.HF_TOKEN ?? "",
    get pollinationsApiKey(): string {
      return process.env.POLLINATIONS_API_KEY?.trim() || "";
    },
    clientOrigin: configuredOrigins[0] || "http://localhost:3000",
    clientOrigins: configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins,
    get boardSecret(): string {
      return getBoardSecret();
    },
    get blobReadWriteToken(): string {
      return process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";
    },
    get blobToken(): string {
      return process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";
    },
    get s3(): S3Config {
      return {
        endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
        region: process.env.S3_REGION?.trim() || undefined,
        bucket: process.env.S3_BUCKET?.trim() || undefined,
        accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || undefined,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined,
        publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.trim() || undefined
      };
    },
    get s3Endpoint() { return process.env.S3_ENDPOINT?.trim(); },
    get s3Region() { return process.env.S3_REGION?.trim(); },
    get s3Bucket() { return process.env.S3_BUCKET?.trim(); },
    get s3AccessKeyId() { return process.env.S3_ACCESS_KEY_ID?.trim(); },
    get s3SecretAccessKey() { return process.env.S3_SECRET_ACCESS_KEY?.trim(); },
    get s3PublicBaseUrl() { return process.env.S3_PUBLIC_BASE_URL?.trim(); }
  };
}

export const env = validateEnv();
