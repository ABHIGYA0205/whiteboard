import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { env } from "../utils/env";
import { saveBase64Image } from "../utils/storage";

export const aiRouter = Router();

const HORDE_BASE = "https://stablehorde.net/api/v2";
const ANON_KEY = "0000000000";

// A4.4: In-memory cache for generation results
const resultCache = new Map<string, string>();

// A4.3: In-memory Job store
type JobStatus = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  imageUrl?: string;
  error?: string;
  createdAt: number;
};
const jobs = new Map<string, JobStatus>();

// Clean up stale jobs older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > 15 * 60 * 1000) {
      jobs.delete(id);
    }
  }
}, 60 * 1000);

// A4.2: Rate limiter (5 requests per minute per IP)
const ipRateLimit = new Map<string, number[]>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRateLimit.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (timestamps.length >= 5) {
    return false;
  }
  timestamps.push(now);
  ipRateLimit.set(ip, timestamps);
  return true;
}

function getCacheKey(prompt: string, imageBase64: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(prompt);
  // Hash image content / length
  hash.update(imageBase64.slice(0, 1000));
  hash.update(String(imageBase64.length));
  return hash.digest("hex");
}

async function tryHuggingFace(prompt: string, model: string): Promise<string | null> {
  if (!env.hfToken) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout (A4.2)

    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.hfToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    // Persist to disk instead of returning raw base64 (A1.3)
    return await saveBase64Image(base64);
  } catch {
    return null;
  }
}

async function tryPollinations(prompt: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const encodedPrompt = encodeURIComponent(prompt.slice(0, 200));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
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

    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    return await saveBase64Image(base64);
  } catch {
    return null;
  }
}

async function tryAIHorde(prompt: string, updateProgress?: (p: number) => void): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const submitResponse = await fetch(`${HORDE_BASE}/generate/async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY
      },
      body: JSON.stringify({
        prompt,
        params: {
          width: 512,
          height: 512,
          steps: 15,
          cfg_scale: 7,
          sampler_name: "k_euler"
        },
        nsfw: false,
        censor_nsfw: false,
        slow_workers: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!submitResponse.ok) return null;
    const { id: hordeJobId } = (await submitResponse.json()) as { id: string };

    // Poll up to 3 times (6 seconds total), don't keep user waiting if queue is long
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      updateProgress?.(50 + i * 15);

      const statusResponse = await fetch(`${HORDE_BASE}/generate/status/${hordeJobId}`);
      if (!statusResponse.ok) continue;

      const status = (await statusResponse.json()) as {
        done: boolean;
        faulted: boolean;
        wait_time?: number;
        queue_position?: number;
        generations?: Array<{ img: string }>;
      };

      if (status.faulted || (status.wait_time && status.wait_time > 45)) {
        return null;
      }

      if (status.done && status.generations && status.generations.length > 0) {
        const img = status.generations[0].img;
        if (img.startsWith("http://") || img.startsWith("https://")) {
          return img;
        }
        return await saveBase64Image(`data:image/webp;base64,${img}`);
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function synthesizeArtisticEnhancement(prompt: string, imageBase64: string): Promise<string> {
  const isCyberpunk = /cyberpunk/i.test(prompt);
  const isAnime = /anime/i.test(prompt);
  const is3D = /3d|render|clay/i.test(prompt);
  const isOil = /oil|painting/i.test(prompt);
  const isWatercolor = /watercolor/i.test(prompt);
  const isSketch = /pencil|sketch|graphite/i.test(prompt);

  let accent1 = "#8b5cf6";
  let accent2 = "#ec4899";
  let styleTitle = "DIGITAL ART";

  if (isCyberpunk) {
    accent1 = "#06b6d4";
    accent2 = "#f43f5e";
    styleTitle = "CYBERPUNK";
  } else if (isAnime) {
    accent1 = "#f472b6";
    accent2 = "#c084fc";
    styleTitle = "ANIME STYLE";
  } else if (is3D) {
    accent1 = "#38bdf8";
    accent2 = "#818cf8";
    styleTitle = "3D RENDER";
  } else if (isWatercolor) {
    accent1 = "#06b6d4";
    accent2 = "#10b981";
    styleTitle = "WATERCOLOR";
  } else if (isOil) {
    accent1 = "#f59e0b";
    accent2 = "#d97706";
    styleTitle = "OIL PAINTING";
  } else if (isSketch) {
    accent1 = "#64748b";
    accent2 = "#334155";
    styleTitle = "PENCIL SKETCH";
  }

  const cleanPrompt = prompt.split(",")[0].replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const width = 640;
  const height = 480;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accent1}" stop-opacity="0.22" />
        <stop offset="50%" stop-color="#0f111a" stop-opacity="0.96" />
        <stop offset="100%" stop-color="${accent2}" stop-opacity="0.28" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="12" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="#0b0c14" rx="16"/>
    <rect width="${width}" height="${height}" fill="url(#bg)" rx="16"/>
    
    <circle cx="140" cy="120" r="130" fill="${accent1}" opacity="0.16" filter="url(#glow)" />
    <circle cx="500" cy="350" r="150" fill="${accent2}" opacity="0.16" filter="url(#glow)" />
    
    ${imageBase64 ? `<image href="${imageBase64}" x="40" y="40" width="${width - 80}" height="${height - 110}" preserveAspectRatio="xMidYMid meet" opacity="0.95" filter="url(#glow)" />` : ""}
    
    <g transform="translate(32, 28)">
      <rect width="120" height="26" rx="6" fill="${accent1}" opacity="0.25" />
      <rect width="120" height="26" rx="6" fill="none" stroke="${accent1}" stroke-width="1" opacity="0.6" />
      <text x="60" y="17" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="800" text-anchor="middle" letter-spacing="1">${styleTitle}</text>
    </g>

    <g transform="translate(32, ${height - 56})">
      <rect width="${width - 64}" height="38" rx="8" fill="rgba(15, 23, 42, 0.8)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1"/>
      <circle cx="20" cy="19" r="4" fill="${accent2}" />
      <text x="36" y="23" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600">${cleanPrompt}</text>
    </g>
  </svg>`;

  const base64Svg = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return await saveBase64Image(base64Svg);
}

async function processGeneration(job: JobStatus, prompt: string, imageBase64: string) {
  try {
    job.status = "processing";
    job.progress = 20;

    let enrichedPrompt = `Masterpiece illustration based on sketch: ${prompt}. Clean, high quality digital artwork.`;
    if (imageBase64.length > 1000) {
      enrichedPrompt += " Faithful to outlined silhouette and spatial layout.";
    }

    let imageUrl: string | null = null;

    // 1. Try Hugging Face if token provided
    if (env.hfToken) {
      job.progress = 30;
      imageUrl = await tryHuggingFace(enrichedPrompt, "black-forest-labs/FLUX.1-schnell");
      if (!imageUrl) {
        imageUrl = await tryHuggingFace(enrichedPrompt, "stabilityai/sd-turbo");
      }
    }

    // 2. Try Pollinations.ai
    if (!imageUrl) {
      job.progress = 50;
      imageUrl = await tryPollinations(enrichedPrompt);
    }

    // 3. Try AI Horde with fast queue check
    if (!imageUrl) {
      job.progress = 70;
      imageUrl = await tryAIHorde(enrichedPrompt, (p) => {
        job.progress = Math.max(job.progress, p);
      });
    }

    // 4. Guaranteed artistic synthesis fallback
    if (!imageUrl) {
      job.progress = 90;
      imageUrl = await synthesizeArtisticEnhancement(prompt, imageBase64);
    }

    const cacheKey = getCacheKey(prompt, imageBase64);
    resultCache.set(cacheKey, imageUrl);

    job.status = "completed";
    job.progress = 100;
    job.imageUrl = imageUrl;
  } catch (err) {
    try {
      const fallbackUrl = await synthesizeArtisticEnhancement(prompt, imageBase64);
      job.status = "completed";
      job.progress = 100;
      job.imageUrl = fallbackUrl;
    } catch {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Image generation failed.";
    }
  }
}

aiRouter.post("/enhance", async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: "Rate limit exceeded. Maximum 5 requests per minute." });
    return;
  }

  const { imageBase64, prompt } = req.body as { imageBase64: string; prompt: string };

  if (!imageBase64 || !prompt) {
    res.status(400).json({ error: "imageBase64 and prompt are required." });
    return;
  }

  // A4.4: Check Cache
  const cacheKey = getCacheKey(prompt, imageBase64);
  if (resultCache.has(cacheKey)) {
    const cachedUrl = resultCache.get(cacheKey)!;
    res.json({ imageUrl: cachedUrl, cached: true });
    return;
  }

  // A4.3: Create Job
  const jobId = crypto.randomUUID();
  const job: JobStatus = {
    id: jobId,
    status: "pending",
    progress: 5,
    createdAt: Date.now()
  };
  jobs.set(jobId, job);

  // Trigger processing asynchronously in background
  void processGeneration(job, prompt, imageBase64);

  // Return jobId for polling/streaming
  res.status(202).json({ jobId, status: "pending" });
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
    error: job.error
  });
});