import { Router } from "express";
import { env } from "../utils/env";

export const aiRouter = Router();

const HORDE_BASE = "https://stablehorde.net/api/v2";
const ANON_KEY = "0000000000"; // anonymous access on AI Horde

async function tryHuggingFace(prompt: string, model: string): Promise<string | null> {
  if (!env.hfToken) return null;

  try {
    console.log(`Attempting HF model: ${model}...`);
    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.hfToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt })
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.warn(`HF ${model} failed (status ${response.status}): ${err.slice(0, 150)}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.warn(`HF ${model} request error:`, error);
    return null;
  }
}

async function tryAIHorde(prompt: string): Promise<string> {
  console.log("Submitting request to AI Horde (any worker, all models)...");

  // Step 1: Submit generation job without restricting to specific model string
  // This allows ANY online worker to process the request immediately
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
      slow_workers: true
    })
  });

  if (!submitResponse.ok) {
    const errData = await submitResponse.json().catch(() => null);
    throw new Error(
      errData?.message || `Horde submit failed with status ${submitResponse.status}`
    );
  }

  const { id: jobId } = (await submitResponse.json()) as { id: string };
  console.log(`AI Horde job submitted: ${jobId}`);

  // Step 2: Poll for completion (up to ~90 seconds)
  const maxAttempts = 45;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`${HORDE_BASE}/generate/status/${jobId}`);
    if (!statusResponse.ok) continue;

    const status = (await statusResponse.json()) as {
      done: boolean;
      faulted: boolean;
      wait_time?: number;
      queue_position?: number;
      generations?: Array<{ img: string }>;
    };

    if (status.faulted) {
      throw new Error("Image generation faulted on AI Horde worker.");
    }

    if (i % 5 === 0) {
      console.log(
        `AI Horde poll ${i + 1}/${maxAttempts} - queue: ${status.queue_position ?? "?"}, wait: ${status.wait_time ?? "?"}s`
      );
    }

    if (status.done && status.generations && status.generations.length > 0) {
      const img = status.generations[0].img;
      // AI Horde returns either a hosted image URL or a base64 string
      if (img.startsWith("http://") || img.startsWith("https://")) {
        try {
          const imgRes = await fetch(img);
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/webp";
          return `data:${contentType};base64,${buffer.toString("base64")}`;
        } catch {
          return img; // Fallback to direct URL if fetch fails
        }
      }
      return `data:image/webp;base64,${img}`;
    }
  }

  throw new Error("Image generation timed out on AI Horde. Please try again.");
}

aiRouter.post("/enhance", async (req, res) => {
  try {
    const { imageBase64, prompt } = req.body as {
      imageBase64: string;
      prompt: string;
    };

    if (!imageBase64 || !prompt) {
      res.status(400).json({
        error: "imageBase64 and prompt are required."
      });
      return;
    }

    const enhancedPrompt =
      `High quality, detailed illustration: ${prompt}. ` +
      `Clean, professional, digital art style.`;

    let imageUrl: string | null = null;

    // 1. Try fast HuggingFace models first (if token provided)
    if (env.hfToken) {
      imageUrl = await tryHuggingFace(enhancedPrompt, "black-forest-labs/FLUX.1-schnell");
      if (!imageUrl) {
        imageUrl = await tryHuggingFace(enhancedPrompt, "stabilityai/sd-turbo");
      }
    }

    // 2. Fall back to AI Horde if HF was not available or failed
    if (!imageUrl) {
      imageUrl = await tryAIHorde(enhancedPrompt);
    }

    res.json({ imageUrl });
  } catch (error) {
    console.error("AI enhance error:", error);

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown image generation error"
    });
  }
});