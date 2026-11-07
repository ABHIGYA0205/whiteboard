import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { put } from "@vercel/blob";
import { env, type S3Config } from "./env";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB decoded image bytes

// Ensure uploads directory exists synchronously on module load
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

export class ImageValidationError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code = "INVALID_IMAGE", statusCode = 400) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ImageSizeLimitError extends ImageValidationError {
  constructor(message: string) {
    super(message, "PAYLOAD_TOO_LARGE", 413);
    this.name = "ImageSizeLimitError";
  }
}

export class StorageBackendError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code = "STORAGE_ERROR") {
    super(message);
    this.name = "StorageBackendError";
    this.code = code;
    this.statusCode = 503;
  }
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
  throw new ImageValidationError(
    `Unsupported image type "${rawType}". Allowed types: image/png, image/jpeg, image/webp, image/gif, image/svg+xml.`,
    "UNSUPPORTED_IMAGE_TYPE",
    400
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
 * Rejects based on decoded buffer length (8 MB limit).
 * Keeps a cheap sanity pre-check on data URL length, but bases error messages
 * on the decoded size.
 */
export function parseAndValidateDataUrl(dataUrl: string): ParsedImage {
  // Cheap sanity pre-check before regex/decoding.
  // 8 MB of binary translates to ~10.7 MB in base64. Reject obviously oversized payloads (> 16 MB).
  const rawBytes = Buffer.byteLength(dataUrl);
  if (rawBytes > 16 * 1024 * 1024) {
    const estimatedMb = ((rawBytes * 0.75) / (1024 * 1024)).toFixed(2);
    throw new ImageSizeLimitError(
      `Image exceeds maximum allowed size of 8 MB (received ~${estimatedMb} MB)`
    );
  }

  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) {
    throw new ImageValidationError("Invalid image data URL format", "INVALID_IMAGE", 400);
  }

  const mimeType = match[1].toLowerCase().trim();
  const { contentType, extension } = deriveImageMeta(mimeType);

  const base64Data = match[2];
  const buffer = Buffer.from(base64Data.replace(/\s+/g, ""), "base64");

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new ImageSizeLimitError(
      `Image exceeds maximum allowed size of 8 MB (received ${(
        buffer.length /
        (1024 * 1024)
      ).toFixed(2)} MB)`
    );
  }

  if (buffer.length === 0) {
    throw new ImageValidationError("Decoded image buffer is empty", "EMPTY_IMAGE", 400);
  }

  return { contentType, extension, buffer };
}

export type StorageBackend = "vercel-blob" | "s3" | "local";

let blobTokenOverride: string | null = null;
let blobPutOverride:
  | ((pathname: string, body: Buffer, options: any) => Promise<{ url: string }>)
  | null = null;

let storageFallbacks = 0;

export function setBlobTokenForTesting(token: string | null): void {
  blobTokenOverride = token;
}

export function setBlobPutForTesting(
  fn: ((pathname: string, body: Buffer, options: any) => Promise<{ url: string }>) | null
): void {
  blobPutOverride = fn;
}

export function getActiveBlobToken(): string {
  return blobTokenOverride !== null ? blobTokenOverride : env.blobToken;
}

export function isBlobConfigured(): boolean {
  return Boolean(getActiveBlobToken());
}

export function getStorageFallbacks(): number {
  return storageFallbacks;
}

export function resetStorageFallbacksForTesting(): void {
  storageFallbacks = 0;
}

export function getActiveStorageBackend(): StorageBackend {
  if (isBlobConfigured()) {
    return "vercel-blob";
  }
  if (isS3Configured()) {
    return "s3";
  }
  return "local";
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
  if (!isBlobConfigured() && !isS3Configured() && !hasWarnedLocal) {
    hasWarnedLocal = true;
    console.warn("Images are being written to local disk; they will be lost on deploy.");
  }
}

/**
 * Persists a base64 image data URL to Vercel Blob (preferred),
 * S3-compatible object storage (secondary), or local disk in uploads/ (fallback).
 * If a remote backend throws, logs a warning naming the error and falls through
 * to the next available backend, ending at local disk so user images are never lost.
 */
export async function saveBase64Image(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) {
    if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://") || dataUrl.startsWith("/uploads/")) {
      return dataUrl;
    }
    throw new ImageValidationError(
      "Invalid image: expected data URL (data:image/...) or existing image URL",
      "INVALID_IMAGE",
      400
    );
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
  const key = `boards/${filename}`;

  // 1. Preferred backend: Vercel Blob (when token is set)
  if (isBlobConfigured()) {
    const token = getActiveBlobToken();
    try {
      const putFn = blobPutOverride || put;
      const blobResult = await putFn(key, buffer, {
        access: "public",
        contentType,
        token
      });
      if (blobResult?.url) {
        return blobResult.url;
      }
    } catch (blobError: any) {
      storageFallbacks++;
      let errMsg = blobError instanceof Error ? blobError.message : String(blobError);
      if (token) {
        errMsg = errMsg.split(token).join("[REDACTED]");
      }
      console.warn(
        `⚠️ Vercel Blob upload failed (${errMsg}). Falling back to ${
          isS3Configured() ? "S3" : "local disk"
        } storage.`
      );
      // Fall through to next available backend
    }
  }

  // 2. Secondary backend: S3-compatible object storage (when bucket is set)
  if (isS3Configured()) {
    const config = getActiveS3Config();
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
    } catch (s3Error: any) {
      storageFallbacks++;
      const errMsg = s3Error instanceof Error ? s3Error.message : String(s3Error);
      console.warn(
        `⚠️ S3 upload failed (${errMsg}). Falling back to local disk storage; images may be lost on deploy.`
      );
      // Fall through to local disk fallback so image is preserved
    }
  }

  // 3. Fallback to local disk storage
  warnIfLocalStorage();
  try {
    const filePath = path.join(UPLOADS_DIR, filename);
    await fs.promises.writeFile(filePath, buffer);
    return `/uploads/${filename}`;
  } catch (diskError) {
    const errMsg = diskError instanceof Error ? diskError.message : String(diskError);
    console.error(`Failed to write image to disk: ${errMsg}`);
    throw new StorageBackendError(`Failed to persist image: ${errMsg}`);
  }
}
