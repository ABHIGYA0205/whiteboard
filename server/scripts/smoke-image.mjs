// smoke-image.mjs - REVIEWER SCRIPT. Copy it exactly; do not edit it.
//
// Runs the AI image feature through the real HTTP route of the BUILT server (server/dist) with the real key:
//   1. one text picture                                  -> docs/ai-evidence/app/text.out.*
//   2. GET /ai/capabilities                              -> exit 3 if there is no sketch backend
//   3. the apple drawing on the left and on the right    -> left.out.*, right.out.*, checked by the reviewer gate
//   4. the stick figure and the house, style "digital"   -> stick.out.*, house.out.* (for the reviewer's eyes)
// It saves its own output to docs/ai-evidence/app/console.txt.
//
// Cost: 4 sketch pictures (0.02 pollen) and 1 text picture (0.002 with a key).
// Exit codes: 0 = PASS, 1 = FAIL, 2 = crash, 3 = no sketch backend, 4 = sketch backend unavailable (key rejected
// or wallet empty).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";
import { checkDir, PROBE_SUBJECT, PROBE_SEED } from "./sketch-probe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = process.env.SMOKE_EVIDENCE_DIR || path.join(ROOT, "docs", "ai-evidence", "app");
const SKETCHES = path.join(ROOT, "docs", "ai-evidence", "v3", "sketches");
dotenv.config({ path: path.resolve(HERE, "../.env") });

const LOG = [];
function say(line = "") {
  console.log(line);
  LOG.push(String(line));
}
function finish(code, lastLine) {
  say(lastLine);
  fs.writeFileSync(path.join(OUT, "console.txt"), LOG.join("\n") + "\n");
  return code;
}
function sniffExt(buffer) {
  if (buffer.length > 12 && buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(OUT)) {
    if (/\.out\.[a-z]+$/.test(name) || ["meta.json", "gate.json", "console.txt"].includes(name)) fs.rmSync(path.join(OUT, name));
  }
  const ai = await import("../dist/routes/ai.js");
  const storage = await import("../dist/utils/storage.js");
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/ai", ai.aiRouter);
  app.use("/uploads", express.static(storage.getUploadsDir()));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** POST /ai/generate and poll the job. Returns { http, body } for a refusal or { job } once the job has ended. */
  async function run(body) {
    const response = await fetch(`${base}/ai/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const first = await response.json().catch(() => ({}));
    if (first.imageUrl) return { job: { ...first, status: "completed" } };
    if (!response.ok || !first.jobId) return { http: response.status, body: first };
    const started = Date.now();
    while (Date.now() - started < 170000) {
      await sleep(1000);
      const poll = await fetch(`${base}/ai/job/${first.jobId}`);
      if (!poll.ok) continue;
      const job = await poll.json();
      if (job.status === "completed" || job.status === "failed") return { job };
    }
    return { job: { status: "failed", error: "smoke test: the job did not end within 170 s" } };
  }
  async function save(job, stem) {
    const url = String(job.imageUrl);
    let bytes;
    if (url.startsWith("data:")) bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    else bytes = Buffer.from(await (await fetch(/^https?:\/\//.test(url) ? url : base + url)).arrayBuffer());
    const ext = sniffExt(bytes);
    if (!ext) throw new Error(`${stem}: the saved picture is not a PNG, JPEG or WebP`);
    const file = path.join(OUT, `${stem}.out.${ext}`);
    fs.writeFileSync(file, bytes);
    return `${path.relative(ROOT, file)} (${bytes.length} bytes)`;
  }
  const sketch = (name) => `data:image/png;base64,${fs.readFileSync(path.join(SKETCHES, `${name}.png`)).toString("base64")}`;
  const describe = (result) =>
    result.job
      ? `${result.job.status}${result.job.errorCode ? ` errorCode=${result.job.errorCode}` : ""}${result.job.error ? ` error="${result.job.error}"` : ""}`
      : `HTTP ${result.http} ${JSON.stringify(result.body)}`;
  const unavailable = (result) => result.job?.errorCode === "SKETCH_UNAVAILABLE" || result.body?.code === "SKETCH_UNAVAILABLE";

  let code;
  try {
    say("=== SMOKE TEST: AI image generation through POST /ai/generate ===");
    say("1. text picture (no sketch)");
    const text = await run({ prompt: "a majestic mountain landscape at sunset", seed: PROBE_SEED });
    let textOk = false;
    if (text.job?.status === "completed" && text.job.imageUrl) {
      if (text.job.sketchGuided !== false) throw new Error(`text picture: sketchGuided must be false, got ${text.job.sketchGuided}`);
      say(`   ok  model=${text.job.model}  ${await save(text.job, "text")}`);
      textOk = true;
    } else if (text.job?.errorCode === "RATE_LIMITED") {
      say(`   skipped: the free text service is rate limited (${describe(text)})`);
      textOk = true;
    } else {
      say(`   FAILED: ${describe(text)}`);
    }

    say("2. capabilities");
    const caps = await (await fetch(`${base}/ai/capabilities`)).json();
    const wording = typeof ai.activeSketchWording === "function" ? ai.activeSketchWording()?.id : undefined;
    say(`   sketch=${caps.sketch} sketchModel=${caps.sketchModel} wording=${wording}`);
    if (!caps.sketch) {
      code = finish(3, "no sketch-capable backend configured");
    } else {
      say("3. apple drawing on the left and on the right (gate)");
      let stopped = false;
      let failed = !textOk;
      for (const side of ["left", "right"]) {
        const result = await run({ imageBase64: sketch(side), prompt: PROBE_SUBJECT, seed: PROBE_SEED });
        if (result.job?.status === "completed" && result.job.imageUrl && result.job.sketchGuided === true) {
          say(`   ${side.padEnd(5)} ok  model=${result.job.model} size=${result.job.width}x${result.job.height}  ${await save(result.job, side)}`);
        } else {
          say(`   ${side.padEnd(5)} FAILED: ${describe(result)}${result.job?.status === "completed" ? ` sketchGuided=${result.job.sketchGuided}` : ""}`);
          failed = true;
          stopped = stopped || unavailable(result);
          break;
        }
      }
      let gate = null;
      if (!failed) {
        const stamp = { prompt: PROBE_SUBJECT, seed: PROBE_SEED };
        fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ left: stamp, right: stamp }, null, 2));
        gate = await checkDir(OUT);
        say(`   gate: ${gate.pass ? "PASS" : "FAIL"} ${JSON.stringify(gate.metrics)}`);
        for (const reason of gate.reasons) say("        - " + reason);
      }
      if (!failed) {
        say('4. stick figure and house, style "digital" (not gated)');
        const extras = [
          { name: "stick", prompt: "a man standing and holding a tall wooden stick" },
          { name: "house", prompt: "a small house with a chimney, front view" }
        ];
        for (const extra of extras) {
          const result = await run({ imageBase64: sketch(extra.name), prompt: extra.prompt, styleId: "digital", seed: PROBE_SEED });
          if (result.job?.status === "completed" && result.job.imageUrl && result.job.sketchGuided === true) {
            say(`   ${extra.name.padEnd(5)} ok  ${await save(result.job, extra.name)}`);
          } else {
            say(`   ${extra.name.padEnd(5)} FAILED: ${describe(result)}`);
            failed = true;
            stopped = stopped || unavailable(result);
          }
        }
      }
      if (stopped) code = finish(4, "STOPPED: the sketch backend is unavailable (key rejected or wallet empty). Add credit and run this again.");
      else if (failed || !gate?.pass) code = finish(1, "SMOKE: FAIL");
      else code = finish(0, `SMOKE: PASS wording=${wording} model=${caps.sketchModel}`);
    }
  } finally {
    server.close();
  }
  return code;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("smoke test crashed:", error?.message || error);
    process.exit(2);
  }
);
