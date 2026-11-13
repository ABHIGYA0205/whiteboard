#!/usr/bin/env node
// server/scripts/sketch-probe.mjs - supplied by the reviewer. DO NOT EDIT (the reviewer diffs this file
// and re-runs it on the committed evidence). Only exception: if Pollinations rejects the request FORMAT
// (HTTP 400, 415 or 422), you may fix viaEdits() / viaEditsJson() / viaImageUrl() and must report the exact
// diff. Never touch the sketches, the prompt, the seed, LIMITS or checkDir().
//
// It answers one question with PIXELS instead of labels:
//     "When the sketch moves, does the generated picture move with it?"
//
// Two probe sketches differ only in WHERE a circle is drawn (left / right). Both are generated with the
// SAME prompt and the SAME seed. A backend that really uses the sketch paints the red apple on the left
// for one and on the right for the other. A backend that ignores the sketch returns the same picture
// twice and FAILS. (Comparing file hashes is not a valid test: the free Pollinations endpoint writes the
// request URL into the JPEG metadata, so the file bytes change while every pixel stays identical.)
//
//   node server/scripts/sketch-probe.mjs                      probe the Pollinations backends, write evidence
//   node server/scripts/sketch-probe.mjs --models kontext     probe other models (comma-separated ids or aliases)
//   node server/scripts/sketch-probe.mjs --skip-baseline      skip the keyless baseline (saves ~50 s)
//   node server/scripts/sketch-probe.mjs sketches             only write the probe sketches
//   node server/scripts/sketch-probe.mjs check <dir> [...]    gate only: <dir> holds left.out.* and right.out.*
//
// Reads POLLINATIONS_API_KEY from the environment or from server/.env. The key is never printed or saved.
// Output: docs/ai-evidence/ (sketches, one folder per candidate, summary.json, README.md, contact-sheet.png)
// Needs the devDependency "sharp".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EVIDENCE = process.env.SKETCH_EVIDENCE_DIR || path.join(ROOT, "docs", "ai-evidence");
const GEN_BASE = process.env.POLLINATIONS_GEN_BASE || "https://gen.pollinations.ai";
const MEDIA_BASE = process.env.POLLINATIONS_MEDIA_BASE || "https://media.pollinations.ai";
const LEGACY_BASE = process.env.POLLINATIONS_LEGACY_BASE || "https://image.pollinations.ai";

// "klein" = black-forest-labs/flux.2-klein-4b: image input, not paid-only, 0.005 pollen per image
// (https://gen.pollinations.ai/image/models). One full probe run costs about 0.06 pollen.
const DEFAULT_MODELS = "klein";
export const PROBE_SUBJECT = "one red apple on a plain light grey background, studio product photo";
export const PROBE_SEED = 424242;
export const OUTPUT_SIZE = 768;
const GATE_SIZE = 256;
export const LIMITS = {
  minSensitivity: 0.03, // mean |left - right| per channel (0..1). Identical pictures score exactly 0.
  minRedFraction: 0.01, // the apple must exist (rejects blank images, echoed sketches, "censored" placeholders)
  leftMaxCentroid: 0.45, // apple centre must sit in the left part for the left sketch ...
  rightMinCentroid: 0.55 // ... and in the right part for the right sketch
};

/** The instruction every image-EDIT model receives. It never says "left" or "right". */
export function editPrompt(subject) {
  return (
    `Turn this rough black-and-white sketch into a finished picture: ${subject}. ` +
    "Follow the sketch exactly: every drawn shape stays in the same position and at the same size. " +
    "Replace the sketch lines with the finished picture."
  );
}

// ---------------------------------------------------------------------------------------------------
// Sketches (black strokes on white, 512x512)
// ---------------------------------------------------------------------------------------------------
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#fff"/>` +
  `<g fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

export const SKETCHES = {
  left: { svg: svg(`<circle cx="144" cy="300" r="92"/>`), subject: PROBE_SUBJECT },
  right: { svg: svg(`<circle cx="368" cy="300" r="92"/>`), subject: PROBE_SUBJECT },
  stick: {
    svg: svg(
      `<circle cx="165" cy="115" r="42"/><path d="M165 157V330M165 210L92 280M165 210L290 152M165 330L110 468M165 330L222 468M290 40V470"/>`
    ),
    subject: "a man standing and holding a tall wooden stick, digital illustration"
  },
  house: {
    svg: svg(
      `<path d="M112 240H400V458H112ZM82 240L256 92L430 240M332 182V122H362V182M228 458V342H284V458M142 292H192V342H142ZM318 292H368V342H318Z"/>`
    ),
    subject: "a small house with a chimney, front view, digital illustration"
  }
};

export async function writeSketches(dir = path.join(EVIDENCE, "sketches")) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, def] of Object.entries(SKETCHES)) {
    const file = path.join(dir, `${name}.png`);
    await sharp(Buffer.from(def.svg)).png().toFile(file);
    out[name] = { file, buffer: fs.readFileSync(file), subject: def.subject };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------------------------------
function findOut(dir, stem) {
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const file = path.join(dir, `${stem}.out.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

async function loadRgb(file) {
  const meta = await sharp(file).metadata();
  const data = await sharp(file)
    .removeAlpha()
    .toColourspace("srgb")
    .resize(GATE_SIZE, GATE_SIZE, { fit: "fill" })
    .raw()
    .toBuffer();
  return { data, width: meta.width || 0, height: meta.height || 0 };
}

function meanAbsDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

// "Red" = clearly red pixels (the apple), not brown, orange or skin.
function redStats(rgb) {
  let count = 0;
  let sumX = 0;
  for (let y = 0; y < GATE_SIZE; y++) {
    for (let x = 0; x < GATE_SIZE; x++) {
      const i = (y * GATE_SIZE + x) * 3;
      const r = rgb[i] / 255;
      if (r > 0.4 && rgb[i + 1] / 255 < 0.55 * r && rgb[i + 2] / 255 < 0.55 * r) {
        count++;
        sumX += x + 0.5;
      }
    }
  }
  return { fraction: count / (GATE_SIZE * GATE_SIZE), centroidX: count ? sumX / count / GATE_SIZE : null };
}

export async function checkDir(dir) {
  const result = { dir: path.relative(ROOT, path.resolve(dir)) || dir, pass: false, reasons: [], metrics: null };
  const leftFile = findOut(dir, "left");
  const rightFile = findOut(dir, "right");
  if (!leftFile || !rightFile) {
    result.reasons.push("missing left.out.* or right.out.*");
    return result;
  }
  let left;
  let right;
  try {
    left = await loadRgb(leftFile);
    right = await loadRgb(rightFile);
  } catch (error) {
    result.reasons.push(`cannot decode an output image: ${error.message}`);
    return result;
  }
  const metaFile = path.join(dir, "meta.json");
  if (fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      const lp = meta?.left?.prompt;
      const rp = meta?.right?.prompt;
      if (lp !== undefined && rp !== undefined && lp !== rp) result.reasons.push("meta.json: left and right used different prompts");
      if (/\b(left|right)\b/i.test(`${lp ?? ""} ${rp ?? ""}`)) result.reasons.push("meta.json: the prompt says left/right; position must come from the sketch only");
      if (meta?.left?.seed !== undefined && meta?.left?.seed !== meta?.right?.seed) result.reasons.push("meta.json: left and right used different seeds");
    } catch {
      result.reasons.push("meta.json is not valid JSON");
    }
  }
  const sensitivity = meanAbsDiff(left.data, right.data);
  const l = redStats(left.data);
  const r = redStats(right.data);
  const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));
  result.metrics = {
    leftSize: `${left.width}x${left.height}`,
    rightSize: `${right.width}x${right.height}`,
    sensitivity: round(sensitivity, 4),
    leftRedFraction: round(l.fraction, 4),
    rightRedFraction: round(r.fraction, 4),
    leftCentroidX: round(l.centroidX, 3),
    rightCentroidX: round(r.centroidX, 3)
  };
  if (Math.min(left.width, left.height, right.width, right.height) < 256) result.reasons.push("an output is smaller than 256px");
  if (sensitivity < LIMITS.minSensitivity) {
    result.reasons.push(
      `SKETCH IGNORED: the two pictures are ${sensitivity === 0 ? "pixel-identical" : "almost identical"} (sensitivity ${sensitivity.toFixed(4)}, need >= ${LIMITS.minSensitivity})`
    );
  }
  if (l.fraction < LIMITS.minRedFraction || r.fraction < LIMITS.minRedFraction) {
    result.reasons.push(
      `NO SUBJECT: no red apple found (red fraction left ${l.fraction.toFixed(4)}, right ${r.fraction.toFixed(4)}, need >= ${LIMITS.minRedFraction}); blank image, echoed sketch or a "censored" placeholder`
    );
  } else {
    if (l.centroidX > LIMITS.leftMaxCentroid) result.reasons.push(`WRONG PLACE: left sketch -> apple centre at x=${l.centroidX.toFixed(2)} (need <= ${LIMITS.leftMaxCentroid})`);
    if (r.centroidX < LIMITS.rightMinCentroid) result.reasons.push(`WRONG PLACE: right sketch -> apple centre at x=${r.centroidX.toFixed(2)} (need >= ${LIMITS.rightMinCentroid})`);
  }
  result.pass = result.reasons.length === 0;
  try {
    fs.writeFileSync(path.join(dir, "gate.json"), JSON.stringify({ limits: LIMITS, ...result }, null, 2));
  } catch {
    /* read-only directory */
  }
  return result;
}

function printGate(result) {
  console.log(`  ${result.pass ? "PASS" : "FAIL"}  ${result.dir}`);
  if (result.metrics) console.log("        " + JSON.stringify(result.metrics));
  for (const reason of result.reasons) console.log("        - " + reason);
}

// ---------------------------------------------------------------------------------------------------
// Pollinations requests
// ---------------------------------------------------------------------------------------------------
function readKey() {
  if (process.env.POLLINATIONS_API_KEY) return process.env.POLLINATIONS_API_KEY.trim();
  try {
    const text = fs.readFileSync(path.join(ROOT, "server", ".env"), "utf8");
    const match = text.match(/^\s*POLLINATIONS_API_KEY\s*=\s*["']?([^"'\r\n#]+)/m);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function sniffExt(buffer) {
  if (buffer.length > 12 && buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

async function timed(fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { ...value, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, status: 0, note: `network error: ${error.message}`, ms: Date.now() - started };
  }
}

async function failure(response) {
  const text = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
  return { ok: false, status: response.status, note: text, retryAfter: Number(response.headers.get("retry-after")) || 0 };
}

/** POST /v1/images/edits with the sketch as a file upload. */
function viaEdits(model, key) {
  return (sketch, subject) =>
    timed(async () => {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", editPrompt(subject));
      form.append("image", new Blob([sketch], { type: "image/png" }), "sketch.png");
      form.append("size", `${OUTPUT_SIZE}x${OUTPUT_SIZE}`);
      form.append("seed", String(PROBE_SEED));
      form.append("n", "1");
      form.append("response_format", "b64_json");
      const response = await fetch(`${GEN_BASE}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(180000)
      });
      if (!response.ok) return failure(response);
      const json = await response.json();
      const item = json?.data?.[0] || {};
      let bytes = null;
      if (item.b64_json) bytes = Buffer.from(item.b64_json, "base64");
      else if (item.url) bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
      if (!bytes) return { ok: false, status: response.status, note: "200 but no data[0].b64_json / url: " + JSON.stringify(json).slice(0, 200) };
      return { ok: true, status: response.status, bytes, prompt: editPrompt(subject), request: `POST ${GEN_BASE}/v1/images/edits model=${model} size=${OUTPUT_SIZE}x${OUTPUT_SIZE} seed=${PROBE_SEED} image=<file>` };
    });
}

/** POST /v1/images/edits as JSON, with the sketch passed as a public URL. */
function viaEditsJson(model, key, urlFor) {
  return (sketch, subject, name) =>
    timed(async () => {
      const imageUrl = await urlFor(name, sketch);
      if (!imageUrl) return { ok: false, status: 0, note: "could not get a public URL for the sketch" };
      const prompt = editPrompt(subject);
      const response = await fetch(`${GEN_BASE}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, image: imageUrl, size: `${OUTPUT_SIZE}x${OUTPUT_SIZE}`, seed: PROBE_SEED, n: 1, response_format: "b64_json" }),
        signal: AbortSignal.timeout(180000)
      });
      if (!response.ok) return failure(response);
      const json = await response.json();
      const item = json?.data?.[0] || {};
      let bytes = null;
      if (item.b64_json) bytes = Buffer.from(item.b64_json, "base64");
      else if (item.url) bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
      if (!bytes) return { ok: false, status: response.status, note: "200 but no data[0].b64_json / url: " + JSON.stringify(json).slice(0, 200) };
      return { ok: true, status: response.status, bytes, prompt, request: `POST ${GEN_BASE}/v1/images/edits (json) model=${model} size=${OUTPUT_SIZE}x${OUTPUT_SIZE} seed=${PROBE_SEED} image=${imageUrl}` };
    });
}

/** GET /image/{prompt}?image=<public url of the sketch>. */
function viaImageUrl(model, key, urlFor) {
  return (sketch, subject, name) =>
    timed(async () => {
      const imageUrl = await urlFor(name, sketch);
      if (!imageUrl) return { ok: false, status: 0, note: "could not get a public URL for the sketch" };
      const prompt = editPrompt(subject);
      const query = new URLSearchParams({ model, image: imageUrl, seed: String(PROBE_SEED), width: String(OUTPUT_SIZE), height: String(OUTPUT_SIZE) });
      const response = await fetch(`${GEN_BASE}/image/${encodeURIComponent(prompt)}?${query}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(180000)
      });
      if (!response.ok) return failure(response);
      if (!(response.headers.get("content-type") || "").startsWith("image/")) return failure(response);
      return {
        ok: true,
        status: response.status,
        bytes: Buffer.from(await response.arrayBuffer()),
        modelUsed: response.headers.get("x-model-used") || "",
        prompt,
        request: `GET ${GEN_BASE}/image/<prompt>?${query}`
      };
    });
}

/** What the app does today: the anonymous endpoint, no key. Limited to 1 image / 45 s per IP. */
function viaAnonymous(urlFor) {
  return (sketch, subject, name) =>
    timed(async () => {
      const imageUrl = (await urlFor(name, sketch)) || `https://example.com/sketch-${name}.png`;
      const query = new URLSearchParams({ model: "klein", image: imageUrl, seed: String(PROBE_SEED), width: String(OUTPUT_SIZE), height: String(OUTPUT_SIZE), nologo: "true" });
      const url = `${LEGACY_BASE}/prompt/${encodeURIComponent(subject)}?${query}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 sketch-probe" }, signal: AbortSignal.timeout(120000) });
        if (response.status === 402 || response.status === 429) {
          const wait = Math.min(60, (Number(response.headers.get("retry-after")) || 45) + 2);
          console.log(`        (free endpoint rate limit: waiting ${wait}s)`);
          await new Promise((resolve) => setTimeout(resolve, wait * 1000));
          continue;
        }
        if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/")) return failure(response);
        return {
          ok: true,
          status: response.status,
          bytes: Buffer.from(await response.arrayBuffer()),
          modelUsed: response.headers.get("x-model-used") || "",
          prompt: subject,
          request: `GET ${url}`
        };
      }
      return { ok: false, status: 402, note: "free endpoint still rate-limited after 3 attempts" };
    });
}

/** Uploads a sketch to Pollinations media storage (needs the key) and remembers its public URL. */
function makeUploader(key) {
  const cache = new Map();
  return async (name, sketch) => {
    if (!key) return null;
    if (cache.has(name)) return cache.get(name);
    let url = null;
    try {
      const form = new FormData();
      form.append("file", new Blob([sketch], { type: "image/png" }), `sketch-${name}.png`);
      const response = await fetch(`${MEDIA_BASE}/upload`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
      if (response.ok) url = (await response.json())?.url || null;
      else console.log(`        (sketch upload failed: HTTP ${response.status} ${(await response.text()).slice(0, 120)})`);
    } catch (error) {
      console.log(`        (sketch upload failed: ${error.message})`);
    }
    cache.set(name, url);
    return url;
  };
}

// ---------------------------------------------------------------------------------------------------
// Probe run
// ---------------------------------------------------------------------------------------------------
async function runCandidate(candidate, sketches) {
  const dir = path.join(EVIDENCE, candidate.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const meta = { candidate: candidate.id, description: candidate.description, seed: PROBE_SEED };
  console.log(`\n== ${candidate.id} - ${candidate.description}`);
  const generate = async (name) => {
    const sketch = sketches[name];
    const result = await candidate.generate(sketch.buffer, sketch.subject, name);
    const ext = result.ok ? sniffExt(result.bytes) : null;
    meta[name] = { ok: Boolean(result.ok && ext), status: result.status, seconds: Number((result.ms / 1000).toFixed(1)), seed: PROBE_SEED, prompt: result.prompt, modelUsed: result.modelUsed || undefined, request: result.request, note: result.ok && !ext ? "response is not a PNG/JPEG/WebP image" : result.note };
    if (meta[name].ok) fs.writeFileSync(path.join(dir, `${name}.out.${ext}`), result.bytes);
    console.log(`     ${name.padEnd(5)} HTTP ${String(result.status).padEnd(3)} ${String(meta[name].seconds).padStart(5)}s ${meta[name].ok ? `${result.bytes.length} bytes${result.modelUsed ? ` (x-model-used: ${result.modelUsed})` : ""}` : `FAILED: ${meta[name].note || ""}`}`);
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    return meta[name].ok;
  };
  const okLeft = await generate("left");
  const okRight = okLeft && (await generate("right"));
  const why = ["left", "right"]
    .filter((name) => meta[name] && !meta[name].ok)
    .map((name) => `${name}: HTTP ${meta[name].status} ${String(meta[name].note || "").replace(/\|/g, "/").slice(0, 160)}`)
    .join("; ");
  let gate = { dir: path.relative(ROOT, dir), pass: false, reasons: [`generation failed (${why})`], metrics: null };
  if (okLeft && okRight) gate = await checkDir(dir);
  printGate(gate);
  if (gate.pass && candidate.extras) {
    await generate("stick");
    await generate("house");
  }
  return { id: candidate.id, description: candidate.description, pass: gate.pass, reasons: gate.reasons, metrics: gate.metrics, meta };
}

async function contactSheet(results, sketches) {
  const cell = 256;
  const gap = 8;
  const names = ["left", "right", "stick", "house"];
  const composites = [];
  for (let row = 0; row < results.length; row++) {
    const dir = path.join(EVIDENCE, results[row].id);
    for (let column = 0; column < names.length; column++) {
      const files = [sketches[names[column]].file, findOut(dir, names[column])];
      for (let k = 0; k < 2; k++) {
        const left = gap + (column * 2 + k) * (cell + gap);
        const top = gap + row * (cell + gap);
        const input = files[k]
          ? await sharp(files[k]).resize(cell, cell, { fit: "contain", background: "#ffffff" }).png().toBuffer()
          : await sharp({ create: { width: cell, height: cell, channels: 3, background: "#d0d0d0" } }).png().toBuffer();
        composites.push({ input, left, top });
      }
    }
  }
  const width = gap + names.length * 2 * (cell + gap);
  const height = gap + Math.max(1, results.length) * (cell + gap);
  const file = path.join(EVIDENCE, "contact-sheet.png");
  await sharp({ create: { width, height, channels: 3, background: "#808080" } }).composite(composites).png().toFile(file);
  return file;
}

function writeReadme(results, hasKey) {
  const lines = [
    "# AI sketch-conditioning evidence",
    "",
    "Generated by `node server/scripts/sketch-probe.mjs`. Do not edit by hand.",
    "",
    `Probe prompt: \`${PROBE_SUBJECT}\` | seed ${PROBE_SEED} | same prompt and seed for the left and the right sketch.`,
    hasKey ? "" : "\n**POLLINATIONS_API_KEY was not set: only the keyless baseline was probed.**\n",
    "| candidate | gate | sensitivity | apple x (left sketch) | apple x (right sketch) | why it failed |",
    "|---|---|---|---|---|---|"
  ];
  for (const r of results) {
    lines.push(`| \`${r.id}\` - ${r.description} | ${r.pass ? "**PASS**" : "FAIL"} | ${r.metrics?.sensitivity ?? "-"} | ${r.metrics?.leftCentroidX ?? "-"} | ${r.metrics?.rightCentroidX ?? "-"} | ${r.reasons.join("; ") || "-"} |`);
  }
  lines.push("", "`contact-sheet.png`: one row per candidate in the order above; columns are sketch / result pairs for left, right, stick figure, house (grey = not generated).", "", "![contact sheet](contact-sheet.png)", "");
  fs.writeFileSync(path.join(EVIDENCE, "README.md"), lines.join("\n"));
}

async function probe(args) {
  const modelsArg = args.includes("--models") ? args[args.indexOf("--models") + 1] : DEFAULT_MODELS;
  const models = String(modelsArg || DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
  const key = readKey();
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const sketches = await writeSketches();
  const upload = makeUploader(key);
  const candidates = [];
  if (key) {
    for (const model of models) {
      const slug = model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      candidates.push({ id: `${slug}-edits`, description: `${model} via POST /v1/images/edits (sketch uploaded as a file)`, generate: viaEdits(model, key), extras: true });
      candidates.push({ id: `${slug}-edits-json`, description: `${model} via POST /v1/images/edits (JSON, image=SKETCH_URL)`, generate: viaEditsJson(model, key, upload), extras: true });
      candidates.push({ id: `${slug}-url`, description: `${model} via GET /image/{prompt}?image=SKETCH_URL`, generate: viaImageUrl(model, key, upload), extras: true });
    }
  } else {
    console.log("POLLINATIONS_API_KEY is not set (environment or server/.env): only the keyless baseline can be probed.");
  }
  if (!args.includes("--skip-baseline")) {
    candidates.push({ id: "anonymous-baseline", description: "what the app does today: image.pollinations.ai without a key", generate: viaAnonymous(upload), extras: false });
  }
  const results = [];
  for (const candidate of candidates) results.push(await runCandidate(candidate, sketches));
  fs.writeFileSync(path.join(EVIDENCE, "summary.json"), JSON.stringify({ probeSubject: PROBE_SUBJECT, seed: PROBE_SEED, limits: LIMITS, hasKey: Boolean(key), results: results.map(({ meta, ...rest }) => rest) }, null, 2));
  writeReadme(results, Boolean(key));
  const sheet = await contactSheet(results, sketches);
  const winners = results.filter((r) => r.pass).map((r) => r.id);
  console.log("\n================ SUMMARY ================");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(38)} ${r.metrics ? `sensitivity=${r.metrics.sensitivity} appleX(left)=${r.metrics.leftCentroidX} appleX(right)=${r.metrics.rightCentroidX}` : r.reasons.join("; ")}`);
  console.log(`evidence: ${path.relative(ROOT, EVIDENCE)}/  (open ${path.relative(ROOT, sheet)})`);
  console.log(winners.length ? `SKETCH-CAPABLE BACKENDS: ${winners.join(", ")}` : "SKETCH-CAPABLE BACKENDS: none");
  if (!key) return 3;
  return winners.length ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "check") {
    if (args.length < 2) {
      console.log("usage: sketch-probe.mjs check <dir> [<dir> ...]");
      return 2;
    }
    let all = true;
    for (const dir of args.slice(1)) {
      const result = await checkDir(dir);
      printGate(result);
      all = all && result.pass;
    }
    console.log(all ? "GATE PASSED" : "GATE FAILED");
    return all ? 0 : 1;
  }
  if (args[0] === "sketches") {
    const sketches = await writeSketches(args[1]);
    for (const [name, sketch] of Object.entries(sketches)) console.log(`${name}: ${sketch.file}`);
    console.log(`probe subject: "${PROBE_SUBJECT}"  seed: ${PROBE_SEED}`);
    return 0;
  }
  return probe(args);
}

// Run main() only when this file is executed directly (not when it is imported by another script).
const samePath = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(2);
    }
  );
}

