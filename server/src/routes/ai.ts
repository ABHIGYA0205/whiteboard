import { Router } from "express";

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

    const enhancedPrompt =
      `High quality, detailed illustration: ${prompt}. ` +
      `Clean, professional, digital art style.`;

    console.log("Sending request to Pollinations.ai...");

    // Pollinations.ai is completely free, no API key needed
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const pollinationsUrl =
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;

    const response = await fetch(pollinationsUrl);

    if (!response.ok) {
      throw new Error(`Pollinations API returned status ${response.status}`);
    }

    const resultBuffer = Buffer.from(await response.arrayBuffer());

    const contentType = response.headers.get("content-type") || "image/png";
    const resultBase64 =
      `data:${contentType};base64,${resultBuffer.toString("base64")}`;

    res.json({
      imageUrl: resultBase64
    });
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