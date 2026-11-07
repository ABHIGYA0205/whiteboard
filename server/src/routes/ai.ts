import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { env } from "../utils/env";
import { saveBase64Image } from "../utils/storage";

export const aiRouter = Router();

const HORDE_BASE = "https://aihorde.net/api/v2";
const ANON_KEY = "0000000000";

export const DEFAULT_NEGATIVE_PROMPT =
  "blurry, low quality, jpeg artifacts, watermark, text, signature, extra limbs, extra fingers, duplicate person, two people, cropped, deformed, sketch lines, rough pencil strokes";

export const STYLE_PRESETS: Record<string, string> = {
  digital: "vibrant digital art, trending on artstation, detailed illustration",
  photo: "photorealistic, hyperrealistic 8k resolution, cinematic lighting",
  "3d": "3D isometric render, blender octane render, soft ambient lighting",
  anime: "makoto shinkai aesthetic, high quality anime artwork, vibrant colors",
  cyberpunk: "cyberpunk neon aesthetic, moody lighting, futuristic city details",
  watercolor: "delicate watercolor painting, artistic paper texture, soft gradients",
  vector: "clean modern vector illustration, minimalist, flat colors"
};

export class PromptResult extends String {
  prompt: string;
  negativePrompt: string;
  enhance: boolean;
  composition: string;
  qualityTail: string;

  constructor(
    prompt: string,
    negativePrompt: string,
    enhance: boolean,
    composition: string,
    qualityTail: string
  ) {
    super(prompt);
    this.prompt = prompt;
    this.negativePrompt = negativePrompt;
    this.enhance = enhance;
    this.composition = composition;
    this.qualityTail = qualityTail;
  }
}

export function buildPrompt(
  rawPrompt: string,
  options?: {
    aspect?: "square" | "portrait" | "landscape" | null;
    styleId?: string;
    hasSketch?: boolean;
    negativePrompt?: string;
  }
): PromptResult {
  // First sentence only, max 200 chars, cleaned
  const trimmed = (rawPrompt || "").trim();
  const firstSentenceMatch = trimmed.match(/^([^.\n]+)/);
  const subject = (firstSentenceMatch ? firstSentenceMatch[1] : trimmed).slice(0, 200).trim();

  let composition = "";
  if (options?.aspect === "portrait") {
    composition = "full-body vertical composition";
  } else if (options?.aspect === "landscape") {
    composition = "wide landscape composition";
  }

  const qualityTail = "detailed, coherent anatomy, single subject, clean line art to illustration";

  const styleSuffix = options?.styleId ? STYLE_PRESETS[options.styleId] || "" : "";

  const parts = [subject, composition, styleSuffix, qualityTail].filter(Boolean);
  const fullPrompt = parts.join(", ");

  const hasSketch = Boolean(options?.hasSketch);
  const enhance = !hasSketch;
  const negativePrompt = options?.negativePrompt || DEFAULT_NEGATIVE_PROMPT;

  return new PromptResult(fullPrompt, negativePrompt, enhance, composition, qualityTail);
}

export function mapLiteralToDenoising(literal: number = 0.5): number {
  const raw = 0.75 - literal * 0.45;
  const clamped = Math.max(0.25, Math.min(0.8, raw));
  return Number(clamped.toFixed(4));
}

export function deriveDimensions(
  aspect?: "square" | "portrait" | "landscape" | null,
  bounds?: { width: number; height: number } | null,
  hasSketch: boolean = true
): { width: number; height: number } {
  if (!hasSketch) {
    return { width: 1024, height: 1024 };
  }

  let w = 768;
  let h = 768;

  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const ratio = bounds.width / bounds.height;
    if (ratio > 1) {
      w = 1024;
      h = Math.round((1024 / ratio) / 64) * 64;
    } else {
      h = 1024;
      w = Math.round((1024 * ratio) / 64) * 64;
    }
  } else if (aspect === "portrait") {
    w = 640;
    h = 960;
  } else if (aspect === "landscape") {
    w = 960;
    h = 640;
  } else {
    w = 768;
    h = 768;
  }

  w = Math.max(512, Math.min(1024, Math.round(w / 64) * 64));
  h = Math.max(512, Math.min(1024, Math.round(h / 64) * 64));

  return { width: w, height: h };
}

export function computeCacheKey(
  prompt: string,
  sketchBase64: string,
  styleId: string = "",
  seed?: number,
  backend: string = "default"
): string {
  const hash = crypto.createHash("sha256");
  hash.update(prompt.trim().toLowerCase());
  hash.update(styleId.trim().toLowerCase());
  hash.update(String(seed ?? ""));
  hash.update(backend);
  if (sketchBase64 && sketchBase64.trim()) {
    const sketchHash = crypto.createHash("sha256").update(sketchBase64.trim()).digest("hex");
    hash.update(sketchHash);
  } else {
    hash.update("no-sketch");
  }
  return hash.digest("hex");
}

export type CachedResult = {
  imageUrl: string;
  provider: string;
  model: string;
  sketchGuided: boolean;
  seed: number;
};

// In-memory cache for generation results
export const resultCache = new Map<string, CachedResult>();

export type JobStatus = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  imageUrl?: string;
  error?: string;
  provider?: string;
  model?: string;
  sketchGuided?: boolean;
  seed?: number;
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
  resultCache.clear();
  jobs.clear();
}

async function tryAIHordeImg2Img(
  prompt: string,
  rawBase64: string,
  denoisingStrength: number,
  width: number,
  height: number,
  seed: number,
  negativePrompt: string,
  updateProgress?: (p: number) => void
): Promise<{ imageUrl: string; model: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const hordePayload = {
      prompt: `${prompt} ### ${negativePrompt}`,
      params: {
        width,
        height,
        steps: 15,
        cfg_scale: 7,
        n: 1,
        seed: String(seed),
        denoising_strength: denoisingStrength,
        negative_prompt: negativePrompt
      },
      source_image: rawBase64,
      source_processing: "img2img",
      nsfw: false,
      censor_nsfw: false
      // slow_workers must not be set to false for anonymous keys
    };

    const submitResponse = await fetch(`${HORDE_BASE}/generate/async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY
      },
      body: JSON.stringify(hordePayload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!submitResponse.ok) return null;
    const { id: hordeJobId } = (await submitResponse.json()) as { id: string };

    // Poll up to 3 times (6 seconds total); if wait_time > 45 or queue is large, bail to next backend
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      updateProgress?.(30 + i * 15);

      const statusResponse = await fetch(`${HORDE_BASE}/generate/check/${hordeJobId}`);
      if (!statusResponse.ok) continue;

      const check = (await statusResponse.json()) as {
        done: boolean;
        faulted: boolean;
        wait_time?: number;
        queue_position?: number;
      };

      if (check.faulted || (check.wait_time && check.wait_time > 45)) {
        return null;
      }

      if (check.done) {
        const fullStatusRes = await fetch(`${HORDE_BASE}/generate/status/${hordeJobId}`);
        if (!fullStatusRes.ok) return null;
        const fullStatus = (await fullStatusRes.json()) as {
          generations?: Array<{ img: string; model?: string }>;
        };
        const gen = fullStatus.generations?.[0];
        if (!gen) return null;

        const modelName = gen.model || "AI Horde";
        let finalImageUrl: string;
        if (gen.img.startsWith("http://") || gen.img.startsWith("https://")) {
          finalImageUrl = gen.img;
        } else {
          finalImageUrl = await saveBase64Image(`data:image/webp;base64,${gen.img}`);
        }
        return { imageUrl: finalImageUrl, model: modelName };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function tryPollinationsImg(
  prompt: string,
  publicSketchUrl: string | null,
  width: number,
  height: number,
  seed: number,
  negativePrompt: string,
  modelName: string = "klein"
): Promise<{ imageUrl: string; model: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      seed: String(seed),
      nologo: "true",
      negative_prompt: negativePrompt
    });
    if (publicSketchUrl) {
      params.set("image", publicSketchUrl);
    }
    if (modelName) {
      params.set("model", modelName);
    }

    const encodedPrompt = encodeURIComponent(prompt.slice(0, 200));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      redirect: "follow",
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) return null;

    const usedModel = response.headers.get("x-model-used") || modelName || "sana";
    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    const savedUrl = await saveBase64Image(base64);
    return { imageUrl: savedUrl, model: usedModel };
  } catch {
    return null;
  }
}

async function tryHuggingFaceImg2Img(
  prompt: string,
  rawBase64: string,
  model: string = "black-forest-labs/FLUX.1-Kontext-dev"
): Promise<{ imageUrl: string; model: string } | null> {
  if (!env.hfToken) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.hfToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { image: rawBase64 }
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    const savedUrl = await saveBase64Image(base64);
    return { imageUrl: savedUrl, model };
  } catch {
    return null;
  }
}

export async function processGeneration(
  job: JobStatus,
  options: {
    imageBase64?: string;
    prompt: string;
    styleId?: string;
    literal?: number;
    seed?: number;
    aspect?: "square" | "portrait" | "landscape";
    bounds?: { width: number; height: number };
    allowTextOnly?: boolean;
  }
): Promise<void> {
  const seed = options.seed ?? Math.floor(Math.random() * 1000000);
  job.seed = seed;

  try {
    job.status = "processing";
    job.progress = 15;

    const hasSketch = Boolean(options.imageBase64 && options.imageBase64.length > 50);
    const builtPrompt = buildPrompt(options.prompt, {
      aspect: options.aspect,
      styleId: options.styleId,
      hasSketch
    });

    const dimensions = deriveDimensions(options.aspect, options.bounds, hasSketch);

    let publicSketchUrl: string | null = null;
    let rawSketchBase64: string | null = null;

    if (hasSketch && options.imageBase64) {
      job.progress = 25;
      publicSketchUrl = await saveBase64Image(options.imageBase64);
      const match = options.imageBase64.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
      rawSketchBase64 = match ? match[2].replace(/\s+/g, "") : options.imageBase64;
    }

    let winner: { imageUrl: string; provider: string; model: string; sketchGuided: boolean } | null = null;

    // 1. If sketch present, try AI Horde img2img first
    if (hasSketch && rawSketchBase64) {
      job.progress = 35;
      const denoising = mapLiteralToDenoising(options.literal ?? 0.5);
      const hordeRes = await tryAIHordeImg2Img(
        builtPrompt.prompt,
        rawSketchBase64,
        denoising,
        dimensions.width,
        dimensions.height,
        seed,
        builtPrompt.negativePrompt,
        (p) => {
          job.progress = Math.max(job.progress, p);
        }
      );
      if (hordeRes) {
        winner = {
          imageUrl: hordeRes.imageUrl,
          provider: "AI Horde",
          model: hordeRes.model,
          sketchGuided: true
        };
      }
    }

    // 2. Try Hugging Face if HF_TOKEN is configured and sketch is present
    if (!winner && hasSketch && rawSketchBase64 && env.hfToken) {
      job.progress = 50;
      const hfRes = await tryHuggingFaceImg2Img(builtPrompt.prompt, rawSketchBase64);
      if (hfRes) {
        winner = {
          imageUrl: hfRes.imageUrl,
          provider: "Hugging Face",
          model: hfRes.model,
          sketchGuided: true
        };
      }
    }

    // 3. Try Pollinations with image=<blob url> (probe proved klein and default sana accept image=)
    if (!winner && hasSketch && publicSketchUrl) {
      job.progress = 60;
      const pollRes = await tryPollinationsImg(
        builtPrompt.prompt,
        publicSketchUrl,
        dimensions.width,
        dimensions.height,
        seed,
        builtPrompt.negativePrompt,
        "klein"
      );
      if (pollRes) {
        winner = {
          imageUrl: pollRes.imageUrl,
          provider: "Pollinations",
          model: pollRes.model,
          sketchGuided: true
        };
      } else {
        // Fallback to default sana model
        const pollSana = await tryPollinationsImg(
          builtPrompt.prompt,
          publicSketchUrl,
          dimensions.width,
          dimensions.height,
          seed,
          builtPrompt.negativePrompt,
          ""
        );
        if (pollSana) {
          winner = {
            imageUrl: pollSana.imageUrl,
            provider: "Pollinations",
            model: pollSana.model,
            sketchGuided: true
          };
        }
      }
    }

    // 4. Text-only fallback (ONLY if sketch was empty OR caller explicitly allowed text-only fallback)
    if (!winner && (!hasSketch || options.allowTextOnly)) {
      job.progress = 75;
      const textOnlyRes = await tryPollinationsImg(
        builtPrompt.prompt,
        null,
        dimensions.width,
        dimensions.height,
        seed,
        builtPrompt.negativePrompt,
        ""
      );
      if (textOnlyRes) {
        winner = {
          imageUrl: textOnlyRes.imageUrl,
          provider: "Pollinations",
          model: textOnlyRes.model,
          sketchGuided: false
        };
      }
    }

    // Honest failure: do NOT synthesize SVG poster!
    if (!winner) {
      job.status = "failed";
      job.progress = 0;
      job.error = "Image service unavailable, try again.";
      return;
    }

    // Save in cache
    const cacheKey = computeCacheKey(
      options.prompt,
      options.imageBase64 || "",
      options.styleId || "",
      seed,
      winner.provider
    );
    resultCache.set(cacheKey, {
      imageUrl: winner.imageUrl,
      provider: winner.provider,
      model: winner.model,
      sketchGuided: winner.sketchGuided,
      seed
    });

    job.status = "completed";
    job.progress = 100;
    job.imageUrl = winner.imageUrl;
    job.provider = winner.provider;
    job.model = winner.model;
    job.sketchGuided = winner.sketchGuided;
    job.seed = seed;
  } catch (err) {
    job.status = "failed";
    job.progress = 0;
    job.error = err instanceof Error ? err.message : "Image generation failed.";
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
    prompt,
    styleId,
    literal,
    seed: incomingSeed,
    aspect,
    bounds,
    allowTextOnly
  } = req.body as {
    imageBase64?: string;
    prompt: string;
    styleId?: string;
    literal?: number;
    seed?: number;
    aspect?: "square" | "portrait" | "landscape";
    bounds?: { width: number; height: number };
    allowTextOnly?: boolean;
  };

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt is required." });
    return;
  }

  const seed = typeof incomingSeed === "number" ? incomingSeed : Math.floor(Math.random() * 1000000);

  // Check Cache
  const cacheKey = computeCacheKey(
    prompt,
    imageBase64 || "",
    styleId || "",
    seed,
    "default"
  );
  if (resultCache.has(cacheKey)) {
    const cached = resultCache.get(cacheKey)!;
    res.json({
      imageUrl: cached.imageUrl,
      cached: true,
      provider: cached.provider,
      model: cached.model,
      sketchGuided: cached.sketchGuided,
      seed: cached.seed
    });
    return;
  }

  // Create Job
  const jobId = crypto.randomUUID();
  const job: JobStatus = {
    id: jobId,
    status: "pending",
    progress: 5,
    seed,
    createdAt: Date.now()
  };
  jobs.set(jobId, job);

  // Process asynchronously
  void processGeneration(job, {
    imageBase64,
    prompt,
    styleId,
    literal,
    seed,
    aspect,
    bounds,
    allowTextOnly
  });

  res.status(202).json({ jobId, status: "pending", seed });
}

aiRouter.post("/generate", handleGenerateRequest);
aiRouter.post("/enhance", handleGenerateRequest);

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
    provider: job.provider,
    model: job.model,
    sketchGuided: job.sketchGuided,
    seed: job.seed
  });
});
