import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { PNG } from "pngjs";
import { env } from "../utils/env";
import { saveBase64Image } from "../utils/storage";

export const aiRouter = Router();

export const STYLE_PRESETS: Record<string, string> = {
  digital: "vibrant digital art, trending on artstation, detailed illustration",
  photo: "photorealistic, hyperrealistic 8k resolution, cinematic lighting",
  "3d": "3D isometric render, blender octane render, soft ambient lighting",
  anime: "makoto shinkai aesthetic, high quality anime artwork, vibrant colors",
  cyberpunk: "cyberpunk neon aesthetic, moody lighting, futuristic city details",
  watercolor: "delicate watercolor painting, artistic paper texture, soft gradients",
  vector: "clean modern vector illustration, minimalist, flat colors"
};

export interface SketchInspection {
  width: number;
  height: number;
  inkPixels: number;
  isBlank: boolean;
}

/**
 * Inspects a PNG sketch payload (3.2):
 * - Rejects non-PNG, > 4 MB, or side > 2048 with an error.
 * - Counts ink pixels where alpha > 128 and luminance < 160.
 * - Flags as blank if inkPixels < 150.
 */
export function inspectSketch(base64OrDataUrl: string): SketchInspection {
  if (!base64OrDataUrl || typeof base64OrDataUrl !== "string") {
    throw new Error("Invalid sketch payload");
  }

  const match = base64OrDataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (match) {
    const mime = match[1].toLowerCase().trim();
    if (mime !== "image/png") {
      throw new Error("Only PNG sketches are supported");
    }
  }

  const rawBase64 = match ? match[2].replace(/\s+/g, "") : base64OrDataUrl.replace(/\s+/g, "");
  const buffer = Buffer.from(rawBase64, "base64");

  if (buffer.length > 4 * 1024 * 1024) {
    throw new Error("Sketch exceeds 4 MB limit");
  }

  if (
    buffer.length < 8 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    throw new Error("Not a valid PNG image");
  }

  let png: PNG;
  try {
    png = PNG.sync.read(buffer);
  } catch (err: any) {
    throw new Error(`Failed to parse PNG sketch: ${err.message}`);
  }

  if (png.width > 2048 || png.height > 2048) {
    throw new Error("Sketch dimensions exceed 2048px");
  }

  let inkPixels = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];

      if (a > 128) {
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luminance < 160) {
          inkPixels++;
        }
      }
    }
  }

  const isBlank = inkPixels < 150;
  return { width: png.width, height: png.height, inkPixels, isBlank };
}

/**
 * Derives dimensions from the real PNG (3.3):
 * - Same aspect ratio as sketch, long edge 1024, both sides snapped to multiple of 64, minimum 512.
 * - Without a sketch: 1024x1024.
 */
export function deriveDimensions(sketch?: { width: number; height: number } | null): {
  width: number;
  height: number;
} {
  if (!sketch || !sketch.width || !sketch.height) {
    return { width: 1024, height: 1024 };
  }

  const { width, height } = sketch;
  if (width >= height) {
    const ratio = height / width;
    const h = Math.max(512, Math.round((1024 * ratio) / 64) * 64);
    return { width: 1024, height: h };
  } else {
    const ratio = width / height;
    const w = Math.max(512, Math.round((1024 * ratio) / 64) * 64);
    return { width: w, height: 1024 };
  }
}

/**
 * Assembles the prompt (3.4):
 * - Caps user subject at 300 characters.
 * - Never truncates the assembled prompt; the style phrase arrives complete.
 */
export function buildPrompt(rawSubject: string, styleId?: string): string {
  const subject = (rawSubject || "").trim().slice(0, 300);
  const styleSuffix = styleId ? STYLE_PRESETS[styleId] || "" : "";
  if (styleSuffix) {
    return `${subject}, ${styleSuffix}`;
  }
  return subject;
}

export type JobStatus = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  imageUrl?: string;
  error?: string;
  errorCode?: string;
  retryAfter?: number;
  provider?: string;
  model?: string;
  sketchGuided: boolean;
  sketchIgnored?: "blank" | null;
  seed: number;
  width?: number;
  height?: number;
  createdAt: number;
};

export const jobs = new Map<string, JobStatus>();

// Clean up stale jobs older than 15 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > 15 * 60 * 1000) {
      jobs.delete(id);
    }
  }
}, 60 * 1000);
cleanupInterval.unref();

// Rate limiter (5 requests per minute per IP)
const ipRateLimit = new Map<string, number[]>();
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRateLimit.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (timestamps.length >= 5) {
    return false;
  }
  timestamps.push(now);
  ipRateLimit.set(ip, timestamps);
  return true;
}

export function resetRateLimitsForTesting(): void {
  ipRateLimit.clear();
  jobs.clear();
}

/**
 * Text backend execution (3.5):
 * - With a key: GET https://gen.pollinations.ai/image/{prompt} with Bearer key
 * - Without a key: GET https://image.pollinations.ai/prompt/{prompt}
 * - On 402/429: sets RATE_LIMITED error with retryAfter
 */
export async function executeTextGeneration(
  job: JobStatus,
  prompt: string,
  width: number,
  height: number,
  seed: number
): Promise<void> {
  job.status = "processing";
  job.progress = 30;

  try {
    const key = env.pollinationsApiKey;
    let url: string;
    let headers: Record<string, string> = {};
    let targetModel = "flux";

    let response: any = null;

    if (key) {
      targetModel = process.env.POLLINATIONS_TEXT_MODEL || "flux";
      const query = new URLSearchParams({
        model: targetModel,
        seed: String(seed),
        width: String(width),
        height: String(height),
        nologo: "true"
      });
      url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${query.toString()}`;
      headers = { Authorization: `Bearer ${key}` };

      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(120000)
        });
        if (res.ok) {
          response = res;
        } else if (res.status === 401 || res.status === 402) {
          // If key is invalid or wallet is empty, fall back to anonymous endpoint
          response = null;
        } else {
          response = res;
        }
      } catch {
        response = null;
      }
    }

    if (!response) {
      targetModel = "sana";
      const query = new URLSearchParams({
        seed: String(seed),
        width: String(width),
        height: String(height),
        nologo: "true"
      });
      url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${query.toString()}`;
      headers = { "User-Agent": "Mozilla/5.0 sketch-probe" };

      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(120000)
      });
    }

    if (response.status === 402 || response.status === 429) {
      const retryHeader = response.headers.get("retry-after");
      const retryAfter = retryHeader ? Number(retryHeader) || 45 : 45;
      job.status = "failed";
      job.progress = 0;
      job.errorCode = "RATE_LIMITED";
      job.retryAfter = retryAfter;
      job.error = `The free image service allows one picture every 45 seconds for everyone using this app. Try again in ${retryAfter} s.`;
      return;
    }

    if (!response.ok) {
      job.status = "failed";
      job.progress = 0;
      job.error = "Image service unavailable, try again.";
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      job.status = "failed";
      job.progress = 0;
      job.error = "Image service unavailable, try again.";
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) {
      job.status = "failed";
      job.progress = 0;
      job.error = "Image service unavailable, try again.";
      return;
    }

    job.progress = 85;

    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    const savedUrl = await saveBase64Image(base64);

    const usedModel = response.headers.get("x-model-used") || targetModel;

    job.status = "completed";
    job.progress = 100;
    job.imageUrl = savedUrl;
    job.provider = "Pollinations";
    job.model = usedModel;
    job.sketchGuided = false;
  } catch {
    job.status = "failed";
    job.progress = 0;
    job.error = "Image service unavailable, try again.";
  }
}

export async function handleGenerateRequest(req: Request, res: Response): Promise<void> {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: "Rate limit exceeded. Maximum 5 requests per minute." });
    return;
  }

  const {
    imageBase64,
    prompt: rawPrompt,
    styleId,
    seed: incomingSeed,
    allowTextOnly
  } = req.body as {
    imageBase64?: string;
    prompt: string;
    styleId?: string;
    seed?: number;
    allowTextOnly?: boolean;
  };

  if (!rawPrompt || typeof rawPrompt !== "string" || !rawPrompt.trim()) {
    res.status(400).json({ error: "prompt is required." });
    return;
  }

  let sketchInspection: SketchInspection | null = null;
  let sketchIgnored: "blank" | null = null;

  if (imageBase64 && typeof imageBase64 === "string" && imageBase64.trim().length > 0) {
    try {
      sketchInspection = inspectSketch(imageBase64);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Invalid sketch image" });
      return;
    }

    if (sketchInspection.isBlank) {
      sketchIgnored = "blank";
    }
  }

  const hasVisibleSketch = Boolean(sketchInspection && !sketchInspection.isBlank);

  // In Outcome B: no sketch backend is available.
  // visible sketch + no sketch backend -> allowTextOnly: true uses text backend;
  // otherwise answer HTTP 409 { code: "SKETCH_UNAVAILABLE" } without calling anything upstream (3.5)
  if (hasVisibleSketch) {
    if (!allowTextOnly) {
      res.status(409).json({
        error: "Sketch-guided generation is not available",
        code: "SKETCH_UNAVAILABLE"
      });
      return;
    }
  }

  const seed = typeof incomingSeed === "number" ? incomingSeed : Math.floor(Math.random() * 1000000);
  const jobId = crypto.randomUUID();
  const job: JobStatus = {
    id: jobId,
    status: "pending",
    progress: 10,
    sketchGuided: false,
    sketchIgnored,
    seed,
    createdAt: Date.now()
  };
  jobs.set(jobId, job);

  const dimensions = deriveDimensions(hasVisibleSketch ? sketchInspection : null);
  job.width = dimensions.width;
  job.height = dimensions.height;

  const prompt = buildPrompt(rawPrompt, styleId);

  // Execute text generation asynchronously
  void executeTextGeneration(job, prompt, dimensions.width, dimensions.height, seed);

  res.status(202).json({ jobId, status: "pending", seed });
}

aiRouter.post("/generate", handleGenerateRequest);
aiRouter.post("/enhance", handleGenerateRequest);

// 3.6 Capabilities endpoint: in Outcome B, sketch is false, sketchModel is null
aiRouter.get("/capabilities", (_req: Request, res: Response) => {
  res.json({
    sketch: false,
    sketchModel: null
  });
});

aiRouter.get("/job/:id", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = jobId ? jobs.get(jobId) : undefined;

  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    imageUrl: job.imageUrl,
    error: job.error,
    errorCode: job.errorCode,
    retryAfter: job.retryAfter,
    provider: job.provider,
    model: job.model,
    sketchGuided: job.sketchGuided,
    sketchIgnored: job.sketchIgnored,
    seed: job.seed,
    width: job.width,
    height: job.height
  });
});
