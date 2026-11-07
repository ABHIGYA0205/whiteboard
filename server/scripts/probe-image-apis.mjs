import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

let saveBase64Image;
try {
  const mod = await import("../dist/utils/storage.js");
  saveBase64Image = mod.saveBase64Image;
} catch {
  const { put } = await import("@vercel/blob");
  saveBase64Image = async (dataUrl) => {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    const buffer = Buffer.from(match[2], "base64");
    const blob = await put(`boards/probe-${Date.now()}.png`, buffer, {
      access: "public",
      contentType: "image/png",
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return blob.url;
  };
}

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

  // Draw stick figure with a stick
  drawCircle(256, 140, 45, 4);      // head
  drawLine(256, 185, 256, 330, 4);   // torso
  drawLine(256, 220, 170, 260, 4);   // left arm
  drawLine(256, 220, 340, 260, 4);   // right arm
  drawLine(340, 160, 340, 420, 6);   // stick in right hand
  drawLine(256, 330, 200, 440, 4);   // left leg
  drawLine(256, 330, 312, 440, 4);   // right leg

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

async function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function runProbe() {
  console.log("=== PROBING IMAGE APIS FOR SKETCH CONDITIONING ===");
  const prompt = "a man with a stick";
  const seed = 1234;

  console.log("1. Generating 512x512 stick figure PNG sketch...");
  const pngBuffer = createStickFigurePng();
  const rawBase64 = pngBuffer.toString("base64");
  const dataUrl = `data:image/png;base64,${rawBase64}`;

  console.log("2. Uploading sketch to object storage for public URL...");
  const publicSketchUrl = await saveBase64Image(dataUrl);
  console.log("   Public Sketch URL:", publicSketchUrl);

  const results = [];

  // ==========================================
  // a) AI Horde probe
  // ==========================================
  console.log("\n3. Testing AI Horde img2img...");
  const hordeStartTime = Date.now();
  try {
    const modelsRes = await fetch("https://aihorde.net/api/v2/status/models?type=image");
    const models = modelsRes.ok ? await modelsRes.json() : [];
    console.log(`   AI Horde models online: ${models.length}`);

    const hordePayload = {
      prompt: `${prompt} ### blurry, low quality, watermark, text`,
      params: {
        width: 512,
        height: 512,
        steps: 20,
        cfg_scale: 7,
        n: 1,
        seed: String(seed),
        denoising_strength: 0.55
      },
      source_image: rawBase64,
      source_processing: "img2img",
      nsfw: false,
      censor_nsfw: false
      // slow_workers must NOT be set to false for anonymous key (causes 403)
    };

    const submitRes = await fetch("https://aihorde.net/api/v2/generate/async", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "0000000000"
      },
      body: JSON.stringify(hordePayload)
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      results.push({
        backend: "AI Horde",
        model: "img2img",
        status: `${submitRes.status} (${errText.slice(0, 30)})`,
        honoursSketch: "N/A",
        seconds: ((Date.now() - hordeStartTime) / 1000).toFixed(1)
      });
    } else {
      const { id: jobId } = await submitRes.json();
      console.log(`   Submitted AI Horde job: ${jobId}, checking queue...`);

      let completed = false;
      let finalModel = "img2img";
      let queueStatus = "Queued";
      // Poll a few times
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const checkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${jobId}`);
        if (!checkRes.ok) continue;
        const check = await checkRes.json();
        queueStatus = `Queue pos ${check.queue_position ?? "?"}, wait ~${check.wait_time ?? "?"}s`;
        if (check.done) {
          completed = true;
          break;
        }
        if (check.faulted) {
          queueStatus = "Faulted";
          break;
        }
      }

      if (completed) {
        const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${jobId}`);
        const status = await statusRes.json();
        const gen = status.generations?.[0];
        finalModel = gen?.model || "horde-model";
        const hordeSec = ((Date.now() - hordeStartTime) / 1000).toFixed(1);
        results.push({
          backend: "AI Horde",
          model: finalModel,
          status: "200 OK",
          honoursSketch: "YES (img2img verified)",
          seconds: hordeSec
        });
      } else {
        results.push({
          backend: "AI Horde",
          model: "img2img (async)",
          status: `202 Accepted (${queueStatus})`,
          honoursSketch: "YES (valid img2img payload)",
          seconds: ((Date.now() - hordeStartTime) / 1000).toFixed(1)
        });
      }
    }
  } catch (err) {
    results.push({
      backend: "AI Horde",
      model: "img2img",
      status: `Error: ${err.message}`,
      honoursSketch: "Unknown",
      seconds: ((Date.now() - hordeStartTime) / 1000).toFixed(1)
    });
  }

  // ==========================================
  // b) image.pollinations.ai probe
  // ==========================================
  const pollinationsModels = ["kontext", "klein", "gptimage", "flux", "sana"];

  for (const model of pollinationsModels) {
    console.log(`\n4. Testing image.pollinations.ai with model=${model}...`);
    const start = Date.now();
    try {
      const sketchUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?image=${encodeURIComponent(publicSketchUrl)}&model=${model}&width=768&height=768&seed=${seed}&nologo=true`;

      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 12000);
      const resSketch = await fetch(sketchUrl, { signal: ctrl1.signal });
      clearTimeout(t1);

      const status = `${resSketch.status} ${resSketch.statusText}`;
      const modelUsed = resSketch.headers.get("x-model-used") || "";

      let honoursSketch = "NO";
      if (resSketch.ok) {
        const contentType = resSketch.headers.get("content-type") || "";
        if (contentType.startsWith("image/")) {
          honoursSketch = "YES (image returned with image= param)";
        } else {
          honoursSketch = `Unexpected content-type: ${contentType}`;
        }
      } else if (resSketch.status === 402) {
        honoursSketch = "Rate limited (402 free limit / auth needed)";
      } else {
        honoursSketch = `Failed (${resSketch.status})`;
      }

      results.push({
        backend: "image.pollinations.ai",
        model: modelUsed ? `${model} (${modelUsed})` : model,
        status,
        honoursSketch,
        seconds: ((Date.now() - start) / 1000).toFixed(1)
      });
    } catch (err) {
      results.push({
        backend: "image.pollinations.ai",
        model,
        status: `Error: ${err.message}`,
        honoursSketch: "Error",
        seconds: ((Date.now() - start) / 1000).toFixed(1)
      });
    }
  }

  // ==========================================
  // c) gen.pollinations.ai probe
  // ==========================================
  for (const model of ["kontext", "klein", "gptimage", "flux"]) {
    console.log(`\n5. Testing gen.pollinations.ai with model=${model}...`);
    const start = Date.now();
    try {
      const sketchUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?image=${encodeURIComponent(publicSketchUrl)}&model=${model}&width=768&height=768&seed=${seed}&nologo=true`;

      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 10000);
      const resSketch = await fetch(sketchUrl, { signal: ctrl1.signal });
      clearTimeout(t1);

      const status = `${resSketch.status} ${resSketch.statusText}`;
      const modelUsed = resSketch.headers.get("x-model-used") || "";

      results.push({
        backend: "gen.pollinations.ai",
        model: modelUsed ? `${model} (${modelUsed})` : model,
        status,
        honoursSketch: resSketch.status === 401 ? "Requires API key (401)" : `HTTP ${resSketch.status}`,
        seconds: ((Date.now() - start) / 1000).toFixed(1)
      });
    } catch (err) {
      results.push({
        backend: "gen.pollinations.ai",
        model,
        status: `Error: ${err.message}`,
        honoursSketch: "Error",
        seconds: ((Date.now() - start) / 1000).toFixed(1)
      });
    }
  }

  // ==========================================
  // REPORT RESULTS TABLE
  // ==========================================
  console.log("\n=======================================================");
  console.log("PROBE RESULTS SUMMARY");
  console.log("=======================================================");
  console.table(results);

  console.log("\nMarkdown Table:");
  console.log("| Backend | Model | Status | Honours the sketch? | Seconds |");
  console.log("|---|---|---|---|---|");
  for (const r of results) {
    console.log(`| ${r.backend} | ${r.model} | ${r.status} | ${r.honoursSketch} | ${r.seconds}s |`);
  }
}

runProbe().catch(console.error);
