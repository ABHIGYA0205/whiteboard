import { Router } from "express";
import { env } from "../utils/env";

export const aiRouter = Router();

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

    if (!env.hfToken) {
      res.status(500).json({
        error:
          "HF_TOKEN is not configured. Add your Hugging Face token to server/.env"
      });
      return;
    }

    const enhancedPrompt =
      `High quality, detailed illustration: ${prompt}. ` +
      `Clean, professional, digital art style.`;

    console.log("Sending request to Hugging Face...");

    // Use direct fetch to HF's free serverless Inference API
    // This bypasses the paid Inference Providers / credits system
    const response = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.hfToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: enhancedPrompt })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg =
        errorData?.error || `HF API returned status ${response.status}`;
      throw new Error(errorMsg);
    }

    const resultBuffer = Buffer.from(await response.arrayBuffer());

    const resultBase64 =
      `data:image/png;base64,${resultBuffer.toString("base64")}`;

    res.json({
      imageUrl: resultBase64
    });
  } catch (error) {
    console.error("AI enhance error:", error);

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown Hugging Face API error"
    });
  }
});