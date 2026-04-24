import dotenv from "dotenv";

dotenv.config();

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:3001"
];

const configuredOrigins = (process.env.CLIENT_ORIGIN ?? defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT ?? 4001),
  mongoUri:
    process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/whiteboard",
  hfToken: process.env.HF_TOKEN ?? "",
  clientOrigins: configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins
};
