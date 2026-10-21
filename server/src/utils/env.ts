import dotenv from "dotenv";

dotenv.config();

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:3001"
];

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
    clientOrigins: configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins
  };
}

export const env = validateEnv();
