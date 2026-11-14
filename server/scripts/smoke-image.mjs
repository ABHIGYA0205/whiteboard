import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import sharp from "sharp";
import dotenv from "dotenv";
import { writeSketches, checkDir, PROBE_SUBJECT, PROBE_SEED } from "./sketch-probe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EVIDENCE_APP = path.join(ROOT, "docs", "ai-evidence", "app");
dotenv.config({ path: path.resolve(HERE, "../.env") });

async function getImageBuffer(url, baseUrl) {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return Buffer.from(url.slice(comma + 1), "base64");
  }
  const fullUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `${baseUrl}${url}`;
  const res = await fetch(fullUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image from ${fullUrl}: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function saveImage(url, baseUrl, outBasePath) {
  const buf = await getImageBuffer(url, baseUrl);
  const meta = await sharp(buf).metadata();
  if (!meta.format) {
    throw new Error(`Downloaded image is not decodable`);
  }
  const ext = meta.format === "jpeg" ? "jpg" : meta.format;
  const outPath = `${outBasePath}.${ext}`;
  fs.writeFileSync(outPath, buf);
  return { path: outPath, ext, buf, meta };
}

async function main() {
  fs.mkdirSync(EVIDENCE_APP, { recursive: true });

  console.log("=== SMOKE TEST: AI IMAGE GENERATION ===");

  const { aiRouter } = await import("../dist/routes/ai.js");
  const { getUploadsDir } = await import("../dist/utils/storage.js");

  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/ai", aiRouter);
  app.use("/uploads", express.static(getUploadsDir()));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function submitAndPoll(body) {
    const res = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.status === 409) {
      const data = await res.json();
      return { status: 409, data };
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`POST /ai/generate failed (${res.status}): ${errText}`);
    }
    const init = await res.json();
    if (init.imageUrl) {
      return { status: 200, job: init };
    }
    const jobId = init.jobId;
    const start = Date.now();
    while (Date.now() - start < 150000) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
      if (!pollRes.ok) continue;
      const job = await pollRes.json();
      if (job.status === "completed") {
        return { status: 200, job };
      }
      if (job.status === "failed") {
        throw new Error(`Job failed: ${job.error || "Unknown error"} (code: ${job.errorCode})`);
      }
    }
    throw new Error(`Job ${jobId} timed out`);
  }

  try {
    // 1. Text check: POST /ai/generate once without a sketch; require a decodable image and sketchGuided: false; save as docs/ai-evidence/app/text.out.<ext>
    console.log("1. Running text check (no sketch)...");
    const textResult = await submitAndPoll({
      prompt: "a majestic mountain landscape at sunset",
      seed: PROBE_SEED
    });

    if (textResult.status !== 200 || !textResult.job.imageUrl) {
      throw new Error("Text check failed to return an image URL");
    }
    if (textResult.job.sketchGuided !== false) {
      throw new Error(`Text check expected sketchGuided: false, got ${textResult.job.sketchGuided}`);
    }

    const savedText = await saveImage(textResult.job.imageUrl, baseUrl, path.join(EVIDENCE_APP, "text.out"));
    console.log(`   Saved text check image to ${savedText.path} (${savedText.meta.width}x${savedText.meta.height}, ${savedText.meta.format})`);

    // 2. Call GET /ai/capabilities. If sketch is false, print "no sketch-capable backend configured" and exit with code 3
    console.log("2. Checking capabilities...");
    const capRes = await fetch(`${baseUrl}/ai/capabilities`);
    const caps = await capRes.json();
    console.log(`   Capabilities: sketch=${caps.sketch}, sketchModel=${caps.sketchModel}`);

    if (!caps.sketch) {
      console.log("no sketch-capable backend configured");
      server.close();
      process.exit(3);
    }

    // 3. Sketch check (Outcome A): POST /ai/generate twice, with left.png and right.png, same PROBE_SUBJECT, same PROBE_SEED, no style
    console.log("3. Running sketch check with left.png and right.png...");
    const sketches = await writeSketches();
    const leftBase64 = `data:image/png;base64,${sketches.left.buffer.toString("base64")}`;
    const rightBase64 = `data:image/png;base64,${sketches.right.buffer.toString("base64")}`;

    const leftRes = await submitAndPoll({
      prompt: PROBE_SUBJECT,
      imageBase64: leftBase64,
      seed: PROBE_SEED
    });
    if (leftRes.status !== 200 || !leftRes.job.imageUrl || leftRes.job.sketchGuided !== true) {
      throw new Error("Left sketch check failed or sketchGuided is not true");
    }
    await saveImage(leftRes.job.imageUrl, baseUrl, path.join(EVIDENCE_APP, "left.out"));

    const rightRes = await submitAndPoll({
      prompt: PROBE_SUBJECT,
      imageBase64: rightBase64,
      seed: PROBE_SEED
    });
    if (rightRes.status !== 200 || !rightRes.job.imageUrl || rightRes.job.sketchGuided !== true) {
      throw new Error("Right sketch check failed or sketchGuided is not true");
    }
    await saveImage(rightRes.job.imageUrl, baseUrl, path.join(EVIDENCE_APP, "right.out"));

    const meta = {
      left: { prompt: PROBE_SUBJECT, seed: PROBE_SEED, job: leftRes.job },
      right: { prompt: PROBE_SUBJECT, seed: PROBE_SEED, job: rightRes.job }
    };
    fs.writeFileSync(path.join(EVIDENCE_APP, "meta.json"), JSON.stringify(meta, null, 2));

    console.log("4. Running checkDir on docs/ai-evidence/app...");
    const gate = await checkDir(EVIDENCE_APP);
    server.close();

    if (!gate.pass) {
      throw new Error(`Gate failed for app evidence: ${gate.reason}`);
    }
    console.log("PASS");
    process.exit(0);
  } catch (err) {
    server.close();
    console.error("Error in smoke test:", err);
    process.exit(1);
  }
}

main();
