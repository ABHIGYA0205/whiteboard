import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists synchronously on module load
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

/**
 * Persists a base64 image data URL to disk in the uploads folder and returns
 * the public relative URL (e.g. /uploads/<uuid>.<ext>).
 */
export async function saveBase64Image(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) {
    return dataUrl;
  }

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) {
    return dataUrl;
  }

  const rawExt = match[1].toLowerCase();
  const ext = rawExt === "jpeg" ? "jpg" : rawExt.includes("svg") ? "svg" : rawExt;
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");

  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/${filename}`;
}
