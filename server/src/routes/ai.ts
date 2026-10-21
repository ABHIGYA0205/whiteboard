import { Router } from "express";

export const aiRouter = Router();

const HORDE_BASE = "https://stablehorde.net/api/v2";
const ANON_KEY = "0000000000"; // anonymous access, no account needed

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

    console.log("Sending request to AI Horde...");

    // Step 1: Submit the generation request
    const submitResponse = await fetch(`${HORDE_BASE}/generate/async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY
      },
      body: JSON.stringify({
        prompt: enhancedPrompt,
        params: {
          width: 512,
          height: 512,
          steps: 20,
          cfg_scale: 7,
          sampler_name: "k_euler"
        },
        nsfw: false,
        censor_nsfw: true,
        models: ["stable_diffusion"]
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

    // Step 2: Poll for completion (max ~60 seconds)
    let imageBase64Result: string | null = null;
    const maxAttempts = 30;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await fetch(
        `${HORDE_BASE}/generate/status/${jobId}`
      );

      if (!statusResponse.ok) continue;

      const status = (await statusResponse.json()) as {
        done: boolean;
        faulted: boolean;
        generations?: Array<{ img: string }>;
      };

      if (status.faulted) {
        throw new Error("Image generation failed on AI Horde.");
      }

      if (status.done && status.generations && status.generations.length > 0) {
        const imgData = status.generations[0].img;
        // AI Horde returns base64-encoded image data directly
        imageBase64Result = `data:image/png;base64,${imgData}`;
        break;
      }
    }

    if (!imageBase64Result) {
      throw new Error(
        "Image generation timed out. AI Horde may be busy — please try again."
      );
    }

    res.json({
      imageUrl: imageBase64Result
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