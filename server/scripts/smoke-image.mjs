import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import zlib from "node:zlib";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function createStickFigurePng(width = 512, height = 512) {
  const stride = width + 1;
  const raw = Buffer.alloc(height * stride, 255);
  for (let y = 0; y < height; y++) raw[y * stride] = 0;

  function setPixel(x, y, v = 0) {
    if (x >= 0 && x < width && y >= 0 && y < height) raw[y * stride + 1 + x] = v;
  }

  function drawLine(x0, y0, x1, y1, thickness = 4) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (true) {
      for (let ox = -thickness; ox <= thickness; ox++) {
        for (let oy = -thickness; oy <= thickness; oy++) {
          if (ox * ox + oy * oy <= thickness * thickness) setPixel(x + ox, y + oy, 0);
        }
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function drawCircle(cx, cy, r, thickness = 4) {
    for (let dy = -r - thickness; dy <= r + thickness; dy++) {
      for (let dx = -r - thickness; dx <= r + thickness; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - r) <= thickness / 2) setPixel(cx + dx, cy + dy, 0);
      }
    }
  }

  // Head
  drawCircle(256, 140, 45, 4);
  // Torso
  drawLine(256, 185, 256, 330, 4);
  // Arms
  drawLine(256, 220, 170, 260, 4);
  drawLine(256, 220, 340, 260, 4);
  // Stick in right hand
  drawLine(340, 160, 340, 420, 6);
  // Legs
  drawLine(256, 330, 200, 440, 4);
  drawLine(256, 330, 312, 440, 4);

  const compressed = zlib.deflateSync(raw);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([sig, makeChunk("IHDR", ihdr), makeChunk("IDAT", compressed), makeChunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  console.log("=== SMOKE TEST: SKETCH-CONDITIONED AI IMAGE GENERATION ===");

  const prompt = "a man with a stick";
  const seed = Math.floor(Math.random() * 900000) + 100000;

  console.log("1. Creating stick-figure PNG sketch...");
  const pngBuffer = createStickFigurePng();
  const sketchBase64 = `data:image/png;base64,${pngBuffer.toString("base64")}`;

  // Check if a server is already listening
  let baseUrl = process.env.API_URL || "http://127.0.0.1:4000";
  let serverInstance = null;

  try {
    const ping = await fetch(`${baseUrl}/ai/job/ping-check`, { signal: AbortSignal.timeout(1000) });
  } catch {
    // Start temporary express server on ephemeral port
    console.log("   No active server found, starting standalone test server on ephemeral port...");
    const { aiRouter } = await import("../dist/routes/ai.js");
    const app = express();
    app.use(express.json({ limit: "16mb" }));
    app.use("/ai", aiRouter);
    serverInstance = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`   Temporary server listening at ${baseUrl}`);
  }

  const startTime = Date.now();
  console.log(`2. Submitting POST /ai/generate with prompt="${prompt}", seed=${seed}...`);

  const generateRes = await fetch(`${baseUrl}/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      imageBase64: sketchBase64,
      seed,
      literal: 0.5,
      aspect: "square"
    })
  });

  if (!generateRes.ok) {
    const errText = await generateRes.text();
    if (serverInstance) serverInstance.close();
    throw new Error(`POST /ai/generate failed with status ${generateRes.status}: ${errText}`);
  }

  const initData = await generateRes.json();
  let completedData = null;

  if (initData.imageUrl) {
    console.log("   Cache hit! Instant return.");
    completedData = initData;
  } else {
    const jobId = initData.jobId;
    console.log(`   Job submitted: ${jobId}. Polling status...`);

    const maxWaitSeconds = 60;
    const pollIntervalMs = 1500;
    const maxPolls = Math.ceil((maxWaitSeconds * 1000) / pollIntervalMs);

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const statusRes = await fetch(`${baseUrl}/ai/job/${jobId}`);
      if (!statusRes.ok) continue;

      const data = await statusRes.json();
      process.stdout.write(`\r   Polling... progress: ${data.progress}% (status: ${data.status})`);

      if (data.status === "completed" && data.imageUrl) {
        process.stdout.write("\n");
        completedData = data;
        break;
      }

      if (data.status === "failed") {
        process.stdout.write("\n");
        if (serverInstance) serverInstance.close();
        throw new Error(`Generation failed: ${data.error || "Unknown error"}`);
      }
    }
  }

  if (serverInstance) {
    serverInstance.close();
  }

  if (!completedData || !completedData.imageUrl) {
    throw new Error("Generation timed out without returning an image URL.");
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n3. Validating provenance...");
  if (completedData.sketchGuided !== true) {
    throw new Error(
      `FAILURE: sketch was supplied but sketchGuided is false! Result did not condition on sketch.`
    );
  }

  console.log("4. Downloading and saving output image to disk...");
  const imgRes = await fetch(completedData.imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download result image from ${completedData.imageUrl}`);
  }
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const ext = completedData.imageUrl.endsWith(".webp")
    ? "webp"
    : completedData.imageUrl.endsWith(".png")
    ? "png"
    : "jpeg";
  const outputPath = path.resolve(__dirname, `smoke-result.${ext}`);
  fs.writeFileSync(outputPath, imgBuffer);

  console.log("\n==========================================");
  console.log("SMOKE TEST PASSED SUCCESSFULLY");
  console.log("==========================================");
  console.log(`Provider:     ${completedData.provider || "Pollinations"}`);
  console.log(`Model:        ${completedData.model || "sana"}`);
  console.log(`Seed:         ${completedData.seed ?? seed}`);
  console.log(`Duration:     ${elapsedSeconds}s`);
  console.log(`sketchGuided: ${completedData.sketchGuided}`);
  console.log(`Image saved:  ${outputPath} (${imgBuffer.length} bytes)`);
  console.log("==========================================\n");
}

main().catch((err) => {
  console.error("\n❌ Smoke test failed:", err.message);
  process.exit(1);
});
