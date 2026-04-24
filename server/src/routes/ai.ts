import { Router } from "express";
import { env } from "../utils/env";

export const aiRouter = Router();

/**
 * POST /ai/enhance
 *
 * Accepts a base64-encoded sketch image and a text prompt.
 * Sends them to the Hugging Face Inference API (Stable Diffusion img2img)
 * and returns the generated image as a base64 data URL.
 */
aiRouter.post("/enhance", async (req, res) => {
  try {
    const { imageBase64, prompt } = req.body as {
      imageBase64: string;
      prompt: string;
    };

    if (!imageBase64 || !prompt) {
      res.status(400).json({ error: "imageBase64 and prompt are required." });
      return;
    }

    if (!env.hfToken) {
      res.status(500).json({
        error:
          "HF_TOKEN is not configured. Add your Hugging Face token to server/.env"
      });
      return;
    }

    // Strip the data URL prefix to get raw base64
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Use Hugging Face's text-to-image endpoint with the prompt.
    const enhancedPrompt = `High quality, detailed illustration: ${prompt}. Clean, professional, digital art style.`;

    // Using FLUX.1-schnell via HF Inference Router (fast & free)
    const hfResponse = await fetch(
      "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.hfToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: enhancedPrompt
        })
      }
    );

    if (!hfResponse.ok) {
      const errorBody = await hfResponse.text();
      console.error("Hugging Face API error:", hfResponse.status, errorBody);

      // Handle model loading state (common with free tier)
      if (hfResponse.status === 503) {
        res.status(503).json({
          error:
            "The AI model is loading. Please wait ~20 seconds and try again.",
          estimatedTime: JSON.parse(errorBody)?.estimated_time ?? 20
        });
        return;
      }

      res
        .status(hfResponse.status)
        .json({ error: `Hugging Face API error: ${errorBody}` });
      return;
    }

    // The response is a raw image (binary) — convert to base64
    const resultBuffer = Buffer.from(await hfResponse.arrayBuffer());
    const resultBase64 = `data:image/png;base64,${resultBuffer.toString("base64")}`;

    res.json({ imageUrl: resultBase64 });
  } catch (error) {
    console.error("AI enhance error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
