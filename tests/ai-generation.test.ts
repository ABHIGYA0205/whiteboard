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
  resetRateLimitsForTesting
} from "../server/src/routes/ai";
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

describe("AI Generation Pipeline (Outcome B)", () => {
  const originalFetch = globalThis.fetch;
  let server: any = null;
  let baseUrl = "";
  const recordedRequests: { url: string; method?: string; headers?: any; body?: any }[] = [];
  let upstreamHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

    upstreamHandler = async () => {
      const dummyImage = Buffer.alloc(1024, 0x42);
      return new Response(dummyImage, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "x-model-used": "sana"
        }
      });
    };

    // Intercept upstream fetch, but delegate 127.0.0.1 / baseUrl to originalFetch
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
    setBlobTokenForTesting(null);
    setBlobPutForTesting(null);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1 & 2. Sketch + allowTextOnly: false -> HTTP 409 SKETCH_UNAVAILABLE, zero upstream requests
  test("1 & 2. Sketch + allowTextOnly: false -> HTTP 409 SKETCH_UNAVAILABLE, zero upstream requests", async () => {
    const sketch = makeTestPng(512, 512, "#000000");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a red apple",
        imageBase64: sketch,
        allowTextOnly: false
      })
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.code, "SKETCH_UNAVAILABLE");
    assert.equal(recordedRequests.length, 0, "No upstream requests made when sketch unavailable and text not allowed");
  });

  // 3. Sketch + allowTextOnly: true -> one text request, job sketchGuided: false
  test("3. Sketch + allowTextOnly: true -> one text request, job sketchGuided: false", async () => {
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

    // Wait for job completion
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const jobRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
      const job = (await jobRes.json()) as any;
      if (job.status === "completed") {
        assert.equal(job.sketchGuided, false, "sketchGuided is false for text fallback");
        assert.equal(recordedRequests.length, 1, "Exactly one text request made upstream");
        return;
      }
    }
    assert.fail("Job did not complete");
  });

  // 4. A PNG with #ececf1 strokes on white -> treated as blank, sketchIgnored: 'blank'
  test("4. PNG with #ececf1 strokes on white -> no request contains image bytes, job sketchGuided: false, sketchIgnored: 'blank'", async () => {
    const faintSketch = makeTestPng(512, 512, "#ececf1");
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "a mountain landscape",
        imageBase64: faintSketch,
        allowTextOnly: false // Even with allowTextOnly: false, blank sketch proceeds to text with sketchIgnored: "blank"
      })
    });

    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const jobRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
      const job = (await jobRes.json()) as any;
      if (job.status === "completed") {
        assert.equal(job.sketchIgnored, "blank", "sketchIgnored is marked 'blank'");
        assert.equal(job.sketchGuided, false);
        // Verify no request contains image bytes
        assert.equal(recordedRequests.length, 1);
        assert.ok(!recordedRequests[0].url.includes("image="));
        return;
      }
    }
    assert.fail("Job did not complete");
  });

  // 5. Text backend answers 500 -> job failed, honest message, no imageUrl
  test("5. Text backend answers 500 -> job failed, honest message, no imageUrl", async () => {
    upstreamHandler = async () => new Response("Internal Server Error", { status: 500 });

    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "failing image" })
    });

    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const jobRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
      const job = (await jobRes.json()) as any;
      if (job.status === "failed") {
        assert.equal(job.error, "Image service unavailable, try again.");
        assert.equal(job.imageUrl, undefined);
        return;
      }
    }
    assert.fail("Job did not fail as expected");
  });

  // 6. Across all tests no request goes to aihorde.net or huggingface.co
  test("6. Across all requests no request goes to aihorde.net or huggingface.co", async () => {
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

  // 7. A 185-character subject + style -> upstream prompt still ends with complete style phrase
  test("7. A 185-character subject + style -> prompt still ends with complete style phrase", () => {
    const longSubject = "A".repeat(185);
    const assembled = buildPrompt(longSubject, "cyberpunk");
    assert.ok(assembled.startsWith("A".repeat(185)));
    assert.ok(assembled.endsWith("cyberpunk neon aesthetic, moody lighting, futuristic city details"));
  });

  // 8. Anonymous text path answers 402 with retry-after: 38 -> job failed, errorCode: 'RATE_LIMITED', retryAfter: 38
  test("8. Anonymous text path answers 402 with retry-after: 38 -> job failed, errorCode: 'RATE_LIMITED', retryAfter: 38", async () => {
    upstreamHandler = async () =>
      new Response("Payment Required", {
        status: 402,
        headers: { "retry-after": "38" }
      });

    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "rate limited prompt" })
    });

    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as any;

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const jobRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
      const job = (await jobRes.json()) as any;
      if (job.status === "failed") {
        assert.equal(job.errorCode, "RATE_LIMITED");
        assert.equal(job.retryAfter, 38);
        assert.ok(job.error.includes("38 s"));
        return;
      }
    }
    assert.fail("Job did not report rate limit failure");
  });

  // 9. /ai/capabilities: sketch: false
  test("9. /ai/capabilities returns sketch: false, sketchModel: null in Outcome B", async () => {
    const res = await fetch(`${baseUrl}/ai/capabilities`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.deepEqual(body, { sketch: false, sketchModel: null });
  });

  // 10. JSON.stringify(job) and console outputs never contain the secret API key
  test("10. JSON.stringify(job) never contains secret API key", async () => {
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "secret check" })
    });
    const { jobId } = (await res.json()) as any;
    const jobRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
    const job = await jobRes.json();
    const str = JSON.stringify(job);

    assert.ok(!str.includes("sk_"), "Job output must never contain api keys");
    assert.ok(!str.includes("Bearer"), "Job output must never contain Bearer token");
  });

  // 11. A 768x384 sketch -> requested size 1024x512
  test("11. A 768x384 sketch -> requested size 1024x512", () => {
    const dim = deriveDimensions({ width: 768, height: 384 });
    assert.deepEqual(dim, { width: 1024, height: 512 });
  });
});
