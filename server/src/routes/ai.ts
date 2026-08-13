import { Router } from "express";
import { env } from "../utils/env";
import { InferenceClient } from "@huggingface/inference";

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

    const client = new InferenceClient(env.hfToken);


    const result = await client.textToImage({
      model: "black-forest-labs/FLUX.1-schnell",
      inputs: enhancedPrompt,
      provider: "fal-ai",
      outputType: "blob"
    });

    const resultBuffer = Buffer.from(await new Response(result).arrayBuffer());


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