import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env, type S3Config } from "./env";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

// Ensure uploads directory exists synchronously on module load
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

export interface ImageMeta {
  contentType: string;
  extension: string;
}

export function deriveImageMeta(rawType: string): ImageMeta {
  const norm = rawType.toLowerCase().trim();
  if (norm === "png" || norm === "image/png") {
    return { contentType: "image/png", extension: "png" };
  }
  if (norm === "jpeg" || norm === "jpg" || norm === "image/jpeg" || norm === "image/jpg") {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (norm === "webp" || norm === "image/webp") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (norm === "gif" || norm === "image/gif") {
    return { contentType: "image/gif", extension: "gif" };
  }
  if (
    norm === "svg" ||
    norm === "svg+xml" ||
    norm === "image/svg" ||
    norm === "image/svg+xml"
  ) {
    return { contentType: "image/svg+xml", extension: "svg" };
  }
  throw new Error(
    `Unsupported image type "${rawType}". Allowed types: image/png, image/jpeg, image/webp, image/gif, image/svg+xml.`
  );
}

/**
 * Strips the base64 payload from a data URL for safe logging.
 * Image byte payloads must never be printed to logs.
 */
export function stripBase64Payload(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx !== -1) {
    return `${dataUrl.slice(0, commaIdx)},[base64 payload stripped]`;
  }
  return dataUrl.length > 60 ? `${dataUrl.slice(0, 60)}...` : dataUrl;
}

export interface ParsedImage {
  contentType: string;
  extension: string;
  buffer: Buffer;
}

/**
 * Parses and validates an image data URL against size and format guard rails.
 * Rejects data URLs over 8 MB and disallows non-image or unsupported formats.
 */
export function parseAndValidateDataUrl(dataUrl: string): ParsedImage {
  if (Buffer.byteLength(dataUrl) > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Image data URL exceeds maximum allowed size of 8 MB (received ${(
        Buffer.byteLength(dataUrl) /
        (1024 * 1024)
      ).toFixed(2)} MB)`
    );
  }

  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) {
    throw new Error("Invalid image data URL format");
  }

  const mimeType = match[1].toLowerCase().trim();
  const { contentType, extension } = deriveImageMeta(mimeType);

  const base64Data = match[2];
  const buffer = Buffer.from(base64Data.replace(/\s+/g, ""), "base64");

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Decoded image exceeds maximum allowed size of 8 MB (received ${(
        buffer.length /
        (1024 * 1024)
      ).toFixed(2)} MB)`
    );
  }

  if (buffer.length === 0) {
    throw new Error("Decoded image buffer is empty");
  }

  return { contentType, extension, buffer };
}

let s3ConfigOverride: S3Config | null = null;
let s3ClientOverride: { send: (command: any) => Promise<any> } | null = null;

export function setS3ConfigForTesting(config: S3Config | null): void {
  s3ConfigOverride = config;
  cachedS3Client = null;
}

export function setS3ClientForTesting(client: { send: (command: any) => Promise<any> } | null): void {
  s3ClientOverride = client;
}

export function getActiveS3Config(): S3Config {
  return s3ConfigOverride ?? env.s3;
}

export function isS3Configured(): boolean {
  const config = getActiveS3Config();
  return Boolean(config.bucket);
}

let cachedS3Client: S3Client | null = null;

function getS3Client(): { send: (command: any) => Promise<any> } {
  if (s3ClientOverride) {
    return s3ClientOverride;
  }
  if (!cachedS3Client) {
    const config = getActiveS3Config();
    cachedS3Client = new S3Client({
      region: config.region || "auto",
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey
            }
          }
        : {})
    });
  }
  return cachedS3Client;
}

let hasWarnedLocal = false;

export function warnIfLocalStorage(): void {
  if (!isS3Configured() && !hasWarnedLocal) {
    hasWarnedLocal = true;
    console.warn("Images are being written to local disk; they will be lost on deploy.");
  }
}

/**
 * Persists a base64 image data URL to S3-compatible object storage (if configured)
 * or falls back to local disk in uploads/ and returns the public URL.
 */
export async function saveBase64Image(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) {
    return dataUrl;
  }

  let parsed: ParsedImage;
  try {
    parsed = parseAndValidateDataUrl(dataUrl);
  } catch (error) {
    console.error(
      `Failed to validate image (${stripBase64Payload(dataUrl)}): ${
        error instanceof Error ? error.message : error
      }`
    );
    throw error;
  }

  const { contentType, extension, buffer } = parsed;
  const filename = `${randomUUID()}.${extension}`;

  if (isS3Configured()) {
    const config = getActiveS3Config();
    const key = `boards/${filename}`;
    const client = getS3Client();

    try {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable"
      });
      await client.send(command);

      const publicBaseUrl = (config.publicBaseUrl || "").replace(/\/+$/, "");
      if (publicBaseUrl) {
        return `${publicBaseUrl}/${key}`;
      }
      if (config.endpoint) {
        return `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}/${key}`;
      }
      return `https://${config.bucket}.s3.${config.region || "us-east-1"}.amazonaws.com/${key}`;
    } catch (error) {
      console.error(
        `Failed to upload image to S3 (${stripBase64Payload(dataUrl)}): ${
          error instanceof Error ? error.message : error
        }`
      );
      throw error;
    }
  }

  // Fallback to local disk storage
  warnIfLocalStorage();
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/${filename}`;
}
