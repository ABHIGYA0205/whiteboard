import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  mapLiteralToDenoising,
  deriveDimensions,
  computeCacheKey,
  processGeneration,
  DEFAULT_NEGATIVE_PROMPT,
  type JobStatus
} from "../server/src/routes/ai";
import { setBlobPutForTesting, setBlobTokenForTesting } from "../server/src/utils/storage";

describe("AI Sketch-Conditioned Image Generation", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Configure mock blob put so saveBase64Image returns public URL without real network
    setBlobTokenForTesting("mock-blob-token");
    setBlobPutForTesting(async (pathname: string) => ({
      url: `https://mock-blob.vercel-storage.com/${pathname}`
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setBlobTokenForTesting(null);
    setBlobPutForTesting(null);
  });

  test("buildPrompt() includes subject, composition cue and quality tail; excludes enhance=true when sketch is present", () => {
    const raw = "A warrior holding a spear. He is standing on a mountain peak.";

    // With sketch in portrait aspect
    const portraitPrompt = buildPrompt(raw, { aspect: "portrait", hasSketch: true });
    const portraitStr = portraitPrompt.toString();

    assert.ok(portraitStr.includes("A warrior holding a spear"), "Subject first sentence included");
    assert.ok(portraitStr.includes("full-body vertical composition"), "Portrait composition cue included");
    assert.ok(
      portraitStr.includes("detailed, coherent anatomy, single subject, clean line art to illustration"),
      "Quality tail included"
    );
    assert.equal(portraitPrompt.enhance, false, "enhance is false when sketch is present");
    assert.ok(!portraitStr.includes("enhance=true"), "Does not include enhance=true in prompt string");

    // With sketch in landscape aspect
    const landscapePrompt = buildPrompt("A wide forest lake", { aspect: "landscape", hasSketch: true });
    assert.ok(landscapePrompt.toString().includes("wide landscape composition"), "Landscape composition cue included");

    // Without sketch
    const noSketchPrompt = buildPrompt("A cute puppy", { hasSketch: false });
    assert.equal(noSketchPrompt.enhance, true, "enhance is true when no sketch is present");

    // With style preset
    const cyberpunkPrompt = buildPrompt("City street at night", { styleId: "cyberpunk", hasSketch: true });
    assert.ok(cyberpunkPrompt.toString().includes("cyberpunk neon aesthetic"), "Style suffix included");
  });

  test("negative_prompt present in request payload for both Horde and Pollinations", async () => {
    const testSketch = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=";
    const recordedCalls: { url: string; body?: any }[] = [];

    // Mock fetch: reject Horde, allow Pollinations
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      recordedCalls.push({
        url: urlStr,
        body: init?.body ? (typeof init.body === "string" ? JSON.parse(init.body) : init.body) : undefined
      });

      if (urlStr.includes("aihorde.net")) {
        // Return 500 so it falls through to Pollinations
        return new Response(JSON.stringify({ error: "Horde unavailable" }), { status: 500 });
      }

      if (urlStr.includes("pollinations.ai")) {
        const dummyImg = Buffer.alloc(1024, 0x42);
        return new Response(dummyImg, {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "x-model-used": "klein"
          }
        });
      }

      return new Response("Not found", { status: 404 });
    };

    const job: JobStatus = {
      id: "test-negative-prompt-job",
      status: "pending",
      progress: 0,
      createdAt: Date.now()
    };

    await processGeneration(job, {
      imageBase64: testSketch,
      prompt: "a man with a stick",
      seed: 1234
    });

    // Check Horde call payload
    const hordeCall = recordedCalls.find((c) => c.url.includes("aihorde.net/api/v2/generate/async"));
    assert.ok(hordeCall, "AI Horde was called");
    assert.equal(
      hordeCall.body?.params?.negative_prompt,
      DEFAULT_NEGATIVE_PROMPT,
      "negative_prompt present in Horde params"
    );
    assert.ok(hordeCall.body?.prompt?.includes("###"), "Horde prompt uses negative prompt separator");

    // Check Pollinations call URL
    const pollCall = recordedCalls.find((c) => c.url.includes("pollinations.ai"));
    assert.ok(pollCall, "Pollinations was called");
    const pollUrl = new URL(pollCall.url);
    assert.ok(
      pollUrl.searchParams.has("negative_prompt"),
      "negative_prompt query parameter present in Pollinations call"
    );
    assert.equal(
      pollUrl.searchParams.get("negative_prompt"),
      DEFAULT_NEGATIVE_PROMPT,
      "negative_prompt value matches DEFAULT_NEGATIVE_PROMPT"
    );
  });

  test("denoising_strength maps 0 -> 0.75, 0.5 -> ~0.52, 1 -> 0.30 and is clamped to [0.25, 0.8]", () => {
    const val0 = mapLiteralToDenoising(0);
    assert.equal(val0, 0.75, "literal 0 maps to 0.75");

    const valHalf = mapLiteralToDenoising(0.5);
    assert.ok(Math.abs(valHalf - 0.525) < 0.01, `literal 0.5 maps to ~0.52 (got ${valHalf})`);

    const val1 = mapLiteralToDenoising(1);
    assert.equal(val1, 0.3, "literal 1 maps to 0.30");

    // Clamp checks
    const valNegative = mapLiteralToDenoising(-1);
    assert.equal(valNegative, 0.8, "literal < 0 clamped to 0.80");

    const valExceeded = mapLiteralToDenoising(2);
    assert.equal(valExceeded, 0.25, "literal > 1 clamped to 0.25");
  });

  test("deriveDimensions snaps to multiples of 64 and empty sketch defaults to 1024x1024", () => {
    // Empty sketch
    const emptyDim = deriveDimensions("square", null, false);
    assert.deepEqual(emptyDim, { width: 1024, height: 1024 });

    // Portrait aspect
    const portraitDim = deriveDimensions("portrait", null, true);
    assert.equal(portraitDim.width % 64, 0);
    assert.equal(portraitDim.height % 64, 0);
    assert.ok(portraitDim.height >= portraitDim.width);

    // Landscape aspect
    const landscapeDim = deriveDimensions("landscape", null, true);
    assert.equal(landscapeDim.width % 64, 0);
    assert.equal(landscapeDim.height % 64, 0);
    assert.ok(landscapeDim.width >= landscapeDim.height);

    // Bounds snapping
    const customDim = deriveDimensions(null, { width: 700, height: 400 }, true);
    assert.equal(customDim.width % 64, 0);
    assert.equal(customDim.height % 64, 0);
  });

  test("cache key changes when sketch hash changes; identical inputs hit cache", () => {
    const sketchA = "data:image/png;base64,AAAA";
    const sketchB = "data:image/png;base64,BBBB";

    const keyA = computeCacheKey("a man with a stick", sketchA, "digital", 42, "Pollinations");
    const keyB = computeCacheKey("a man with a stick", sketchB, "digital", 42, "Pollinations");
    const keyA2 = computeCacheKey("a man with a stick", sketchA, "digital", 42, "Pollinations");

    assert.notEqual(keyA, keyB, "Different sketches must have different cache keys");
    assert.equal(keyA, keyA2, "Identical inputs must have the exact same cache key");
  });

  test("seed round-trips: same seed returned and reused", async () => {
    const testSketch = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=";

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes("pollinations.ai")) {
        const dummyImg = Buffer.alloc(1024, 0x42);
        return new Response(dummyImg, {
          status: 200,
          headers: { "content-type": "image/jpeg", "x-model-used": "klein" }
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const providedSeed = 987654;
    const job: JobStatus = {
      id: "seed-test-job",
      status: "pending",
      progress: 0,
      createdAt: Date.now()
    };

    await processGeneration(job, {
      imageBase64: testSketch,
      prompt: "seed test prompt",
      seed: providedSeed
    });

    assert.equal(job.status, "completed");
    assert.equal(job.seed, providedSeed, "Seed matches caller-provided seed exactly");
  });

  test("every backend failing -> job.status 'failed', and synthesizeArtisticEnhancement is NOT called", async () => {
    const testSketch = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=";

    // All backends fail
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "Service down" }), { status: 503 });
    };

    const job: JobStatus = {
      id: "fail-job",
      status: "pending",
      progress: 0,
      createdAt: Date.now()
    };

    await processGeneration(job, {
      imageBase64: testSketch,
      prompt: "a warrior"
    });

    assert.equal(job.status, "failed", "Job status is marked failed");
    assert.equal(job.error, "Image service unavailable, try again.");
    assert.equal(job.imageUrl, undefined, "No SVG poster or fake image is returned");
  });

  test("provider, model, and sketchGuided are recorded on the completed job", async () => {
    const testSketch = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=";

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes("pollinations.ai")) {
        const dummyImg = Buffer.alloc(1024, 0x42);
        return new Response(dummyImg, {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "x-model-used": "klein"
          }
        });
      }
      return new Response("Horde offline", { status: 500 });
    };

    // 1. With sketch
    const jobWithSketch: JobStatus = {
      id: "provenance-guided",
      status: "pending",
      progress: 0,
      createdAt: Date.now()
    };
    await processGeneration(jobWithSketch, {
      imageBase64: testSketch,
      prompt: "stick figure"
    });

    assert.equal(jobWithSketch.status, "completed");
    assert.equal(jobWithSketch.provider, "Pollinations");
    assert.equal(jobWithSketch.model, "klein");
    assert.equal(jobWithSketch.sketchGuided, true, "sketchGuided is true when sketch conditioned output");

    // 2. Text only (empty sketch)
    const jobTextOnly: JobStatus = {
      id: "provenance-text",
      status: "pending",
      progress: 0,
      createdAt: Date.now()
    };
    await processGeneration(jobTextOnly, {
      imageBase64: undefined,
      prompt: "only text prompt"
    });

    assert.equal(jobTextOnly.status, "completed");
    assert.equal(jobTextOnly.provider, "Pollinations");
    assert.equal(jobTextOnly.sketchGuided, false, "sketchGuided is false for text-only generation");
  });
});
