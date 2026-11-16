import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { PNG } from "pngjs";
import {
  aiRouter,
  buildPrompt,
  deriveDimensions,
  inspectSketch,
  jobs,
  resetRateLimitsForTesting,
  activeSketchWording,
  sketchEditPrompt,
  sketchBackendAvailable
} from "../server/src/routes/ai";
import {
  SKETCH_MODEL,
  SKETCH_WORDINGS,
  SKETCH_DEFAULT_WORDING
} from "../server/src/config/sketchWordings";
import { setBlobPutForTesting, setBlobTokenForTesting } from "../server/src/utils/storage";

function makeTestPng(width = 512, height = 512, strokeHex = "#000000"): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = 255;
    }
  }

  const r = parseInt(strokeHex.slice(1, 3), 16);
  const g = parseInt(strokeHex.slice(3, 5), 16);
  const b = parseInt(strokeHex.slice(5, 7), 16);

  // Draw 200 ink pixels
  for (let i = 50; i < 250; i++) {
    const idx = (width * 100 + i) << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  }

  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

describe("AI Generation Pipeline (Dual Mode: Sketch & Text)", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.POLLINATIONS_API_KEY;
  const originalWording = process.env.SKETCH_WORDING;

  let server: any = null;
  let baseUrl = "";
  const recordedRequests: { url: string; method?: string; headers?: any; body?: any }[] = [];
  let upstreamHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  const mockImagePng = Buffer.from(
    makeTestPng(256, 256, "#ff0000").replace(/^data:image\/png;base64,/, ""),
    "base64"
  );

  async function waitForJob(jobId: string, maxAttempts = 30): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const res = await fetch(`${baseUrl}/ai/job/${jobId}`);
      if (res.ok) {
        const job = (await res.json()) as any;
        if (job.status === "completed" || job.status === "failed") {
          return job;
        }
      }
    }
    throw new Error(`Job ${jobId} did not finish within timeout`);
  }

  beforeEach(async () => {
    resetRateLimitsForTesting();
    recordedRequests.length = 0;

    setBlobTokenForTesting("mock-blob-token");
    setBlobPutForTesting(async (pathname: string) => ({
      url: `https://mock-blob.vercel-storage.com/${pathname}`
    }));

    const app = express();
    app.use(express.json({ limit: "16mb" }));
    app.use("/ai", aiRouter);
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    upstreamHandler = async (input, init) => {
      const urlStr = input.toString();
      if (urlStr.includes("/v1/images/edits")) {
        return new Response(
          JSON.stringify({
            data: [{ b64_json: mockImagePng.toString("base64") }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      return new Response(mockImagePng, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "x-model-used": "sana"
        }
      });
    };

    // Intercept upstream fetch, delegate 127.0.0.1 / baseUrl to originalFetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      if (urlStr.includes("127.0.0.1") || (baseUrl && urlStr.startsWith(baseUrl))) {
        return originalFetch(input, init);
      }
      recordedRequests.push({
        url: urlStr,
        method: init?.method || "GET",
        headers: init?.headers,
        body: init?.body
      });
      return upstreamHandler(input, init);
    };
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.POLLINATIONS_API_KEY;
    } else {
      process.env.POLLINATIONS_API_KEY = originalApiKey;
    }
    if (originalWording === undefined) {
      delete process.env.SKETCH_WORDING;
    } else {
      process.env.SKETCH_WORDING = originalWording;
    }
    resetRateLimitsForTesting();
    setBlobTokenForTesting(null);
    setBlobPutForTesting(null);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // --- Without a key ---

  // 1. Visible sketch, no allowTextOnly: HTTP 409 { code: "SKETCH_UNAVAILABLE" }, zero upstream requests
  test("1. Without a key: visible sketch, no allowTextOnly -> 409 SKETCH_UNAVAILABLE, zero upstream requests", async () => {
    delete process.env.POLLINATIONS_API_KEY;
    const sketch = makeTestPng(512, 512, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch
      })
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.code, "SKETCH_UNAVAILABLE");
    assert.equal(recordedRequests.length, 0, "Zero upstream requests");
  });

  // 2. Visible sketch, allowTextOnly: true: one upstream text request, job sketchGuided: false
  test("2. Without a key: visible sketch, allowTextOnly: true -> 1 text request, job sketchGuided: false", async () => {
    delete process.env.POLLINATIONS_API_KEY;
    const sketch = makeTestPng(512, 512, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch,
        allowTextOnly: true
      })
    });

    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "completed");
    assert.equal(job.sketchGuided, false);
    assert.equal(recordedRequests.length, 1);
  });

  // 3. GET /ai/capabilities is { sketch: false, sketchModel: null }
  test("3. Without a key: GET /ai/capabilities is { sketch: false, sketchModel: null }", async () => {
    delete process.env.POLLINATIONS_API_KEY;
    const res = await fetch(`${baseUrl}/ai/capabilities`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { sketch: false, sketchModel: null });
  });

  // --- With a key ---

  // 4. GET /ai/capabilities is { sketch: true, sketchModel: SKETCH_MODEL }
  test("4. With a key: GET /ai/capabilities is { sketch: true, sketchModel: SKETCH_MODEL }", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    const res = await fetch(`${baseUrl}/ai/capabilities`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { sketch: true, sketchModel: SKETCH_MODEL });
  });

  // 5. A 768x384 PNG with dark strokes, style digital, fixed seed -> 1 upstream edit request, job sketchGuided: true
  test("5. With a key: 768x384 PNG, style digital, fixed seed -> 1 upstream edit request, job sketchGuided: true", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    const subject = "a red apple";
    const sketchDataUrl = makeTestPng(768, 384, "#000000");
    const postedPngBytes = Buffer.from(sketchDataUrl.slice(sketchDataUrl.indexOf(",") + 1), "base64");
    const fixedSeed = 123456;

    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: subject,
        styleId: "digital",
        imageBase64: sketchDataUrl,
        seed: fixedSeed
      })
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "completed");
    assert.equal(job.sketchGuided, true);
    assert.equal(job.model, SKETCH_MODEL);
    assert.ok(job.imageUrl);

    assert.equal(recordedRequests.length, 1);
    const req = recordedRequests[0];
    assert.equal(req.url, "https://gen.pollinations.ai/v1/images/edits");
    assert.equal(req.method, "POST");

    const authHeader = (req.headers as any)?.Authorization || (req.headers as any)?.authorization;
    assert.equal(authHeader, "Bearer test-key-12345");

    const form = req.body as FormData;
    assert.equal(form.get("model"), SKETCH_MODEL);
    assert.equal(form.get("prompt"), sketchEditPrompt(buildPrompt(subject, "digital")));
    assert.equal(form.get("size"), "1024x512");
    assert.equal(form.get("seed"), String(fixedSeed));
    assert.equal(form.get("n"), "1");
    assert.equal(form.get("response_format"), "b64_json");

    const imageFile = form.get("image") as any;
    assert.ok(imageFile);
    const imageBytes = Buffer.from(await imageFile.arrayBuffer());
    assert.deepEqual(imageBytes, postedPngBytes);
  });

  // 6. Same request, upstream answers 402: job failed, errorCode: SKETCH_UNAVAILABLE, no imageUrl, caps sketch: false, next POST 409
  test("6. Upstream answers 402: job failed SKETCH_UNAVAILABLE, no imageUrl, 1 upstream req, caps sketch: false, next POST 409", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    upstreamHandler = async () => new Response("Payment Required", { status: 402 });

    const sketch = makeTestPng(768, 384, "#000000");
    const payload = {
      prompt: "a red apple",
      imageBase64: sketch,
      seed: 424242
    };

    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "failed");
    assert.equal(job.errorCode, "SKETCH_UNAVAILABLE");
    assert.equal(job.imageUrl, undefined);
    assert.equal(recordedRequests.length, 1);

    // Afterwards capabilities returns sketch: false
    const capsRes = await fetch(`${baseUrl}/ai/capabilities`);
    const caps = await capsRes.json();
    assert.equal(caps.sketch, false);

    // Same POST now answers HTTP 409
    const res2 = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(res2.status, 409);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.code, "SKETCH_UNAVAILABLE");
  });

  // 7. Upstream answers 401: same as test 6
  test("7. Upstream answers 401: job failed SKETCH_UNAVAILABLE, no imageUrl, 1 upstream req, caps sketch: false, next POST 409", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    upstreamHandler = async () => new Response("Unauthorized", { status: 401 });

    const sketch = makeTestPng(768, 384, "#000000");
    const payload = {
      prompt: "a red apple",
      imageBase64: sketch,
      seed: 424242
    };

    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "failed");
    assert.equal(job.errorCode, "SKETCH_UNAVAILABLE");
    assert.equal(job.imageUrl, undefined);
    assert.equal(recordedRequests.length, 1);

    const capsRes = await fetch(`${baseUrl}/ai/capabilities`);
    const caps = await capsRes.json();
    assert.equal(caps.sketch, false);

    const res2 = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(res2.status, 409);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.code, "SKETCH_UNAVAILABLE");
  });

  // 8. Upstream answers 500: job failed honest message, no errorCode, 1 upstream req, caps still sketch: true
  test("8. Upstream answers 500: job failed honest message, no errorCode, 1 upstream req, caps still sketch: true", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    upstreamHandler = async () => new Response("Server Error", { status: 500 });

    const sketch = makeTestPng(768, 384, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch
      })
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "failed");
    assert.equal(job.error, "Image service unavailable, try again.");
    assert.equal(job.errorCode, undefined);
    assert.equal(recordedRequests.length, 1);

    const capsRes = await fetch(`${baseUrl}/ai/capabilities`);
    const caps = await capsRes.json();
    assert.equal(caps.sketch, true);
  });

  // 9. Upstream answers 429 with retry-after: 12: errorCode: RATE_LIMITED, retryAfter: 12
  test("9. Upstream answers 429 with retry-after: 12 -> errorCode: RATE_LIMITED, retryAfter: 12", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    upstreamHandler = async () =>
      new Response("Too Many Requests", {
        status: 429,
        headers: { "retry-after": "12" }
      });

    const sketch = makeTestPng(768, 384, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch
      })
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "failed");
    assert.equal(job.errorCode, "RATE_LIMITED");
    assert.equal(job.retryAfter, 12);
  });

  // 10. Upstream answers 200 with JSON without picture -> job failed, no imageUrl
  test("10. Upstream answers 200 with JSON without picture -> job failed, no imageUrl", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    upstreamHandler = async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const sketch = makeTestPng(768, 384, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch
      })
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "failed");
    assert.equal(job.imageUrl, undefined);
  });

  // 11. Blank sketch (#ececf1) -> no /v1/images/edits, job sketchGuided: false, sketchIgnored: 'blank'
  test("11. Blank sketch (#ececf1) -> no /v1/images/edits, job sketchGuided: false, sketchIgnored: 'blank'", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    const faintSketch = makeTestPng(512, 512, "#ececf1");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a mountain landscape",
        imageBase64: faintSketch
      })
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "completed");
    assert.equal(job.sketchGuided, false);
    assert.equal(job.sketchIgnored, "blank");
    for (const req of recordedRequests) {
      assert.ok(!req.url.includes("/v1/images/edits"), "Must not call /v1/images/edits for blank sketch");
      assert.ok(!req.url.includes("image="), "Must not carry image bytes for blank sketch");
    }
  });

  // 12. No sketch -> 1 upstream text request, job sketchGuided: false
  test("12. No sketch -> 1 upstream text request, job sketchGuided: false", async () => {
    process.env.POLLINATIONS_API_KEY = "test-key-12345";
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a mountain landscape"
      })
    });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;
    const job = await waitForJob(jobId);

    assert.equal(job.status, "completed");
    assert.equal(job.sketchGuided, false);
    assert.equal(recordedRequests.length, 1);
    assert.ok(recordedRequests[0].url.includes("/image/"), "Text generation request sent");
  });

  // 13. Key string appears in no job JSON and in no response body of the app
  test("13. Key string appears in no job JSON and in no response body of the app", async () => {
    const secretKey = "super-secret-key-xyz-98765";
    process.env.POLLINATIONS_API_KEY = secretKey;

    const sketch = makeTestPng(768, 384, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch
      })
    });
    const generateBody = await res.text();
    assert.ok(!generateBody.includes(secretKey), "Generate body must not contain key");

    const { jobId } = JSON.parse(generateBody);
    const job = await waitForJob(jobId);
    assert.ok(!JSON.stringify(job).includes(secretKey), "Job JSON must not contain key");

    const capsRes = await fetch(`${baseUrl}/ai/capabilities`);
    const capsBody = await capsRes.text();
    assert.ok(!capsBody.includes(secretKey), "Capabilities body must not contain key");
  });

  // 14. Wording selection and sketchEditPrompt formatting
  test("14. Wording selection and sketchEditPrompt formatting", () => {
    delete process.env.SKETCH_WORDING;
    const defaultWording = activeSketchWording();
    assert.ok(defaultWording);
    assert.equal(defaultWording.id, SKETCH_DEFAULT_WORDING);

    const otherWording = SKETCH_WORDINGS.find((w) => w.id !== SKETCH_DEFAULT_WORDING);
    if (otherWording) {
      process.env.SKETCH_WORDING = otherWording.id;
      const selected = activeSketchWording();
      assert.ok(selected);
      assert.equal(selected.id, otherWording.id);
    }

    process.env.SKETCH_WORDING = "zzz";
    const fallback = activeSketchWording();
    assert.ok(fallback);
    assert.equal(fallback.id, SKETCH_DEFAULT_WORDING);

    const prompt = sketchEditPrompt("X Y");
    assert.ok(prompt.includes("X Y"));
    assert.ok(!prompt.includes("{subject}"));
  });

  // Additional existing unit tests
  test("A 185-character subject + style -> prompt still ends with complete style phrase", () => {
    const longSubject = "A".repeat(185);
    const assembled = buildPrompt(longSubject, "cyberpunk");
    assert.ok(assembled.startsWith("A".repeat(185)));
    assert.ok(assembled.endsWith("cyberpunk neon aesthetic, moody lighting, futuristic city details"));
  });

  test("A 768x384 sketch -> requested size 1024x512", () => {
    const dim = deriveDimensions({ width: 768, height: 384 });
    assert.deepEqual(dim, { width: 1024, height: 512 });
  });

  test("Across all requests no request goes to aihorde.net or huggingface.co", async () => {
    delete process.env.POLLINATIONS_API_KEY;
    await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "check domains" })
    });

    await new Promise((r) => setTimeout(r, 100));
    for (const req of recordedRequests) {
      assert.ok(!req.url.includes("aihorde.net"), "Must not call aihorde.net");
      assert.ok(!req.url.includes("huggingface.co"), "Must not call huggingface.co");
    }
  });
});
