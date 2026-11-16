// sketch-probe2.mjs - REVIEWER SCRIPT, second measurement. Copy it exactly; do not edit it.
//
// Why a second measurement: the first probe drew a bare circle and asked for "an apple". FLUX.2 klein moved the
// apple only a little (apple centre x=0.40 / 0.52, needed <= 0.45 / >= 0.55). A bare circle is a placeholder, not
// a drawing of the subject. This probe sends a real DRAWING of an apple (outline, stem, leaf), once on the left
// and once on the right, with the same prompt and seed, and measures the same thing with the same limits: did
// the apple in the result move with the drawing? It reuses the gate of sketch-probe.mjs unchanged.
//
//   node server/scripts/sketch-probe2.mjs          run it (needs POLLINATIONS_API_KEY in server/.env)
//   node server/scripts/sketch-probe2.mjs --all    also test the other models when klein already passes
//
// Order and cost (pollen): klein with two prompt wordings (0.02) + stick figure and house with the better
// wording (0.01). Only if klein fails: a zero-price community FLUX.2-dev model (0) and kontext (0.06, plus 0.06
// for stick figure and house if it passes). Worst case about 0.15 pollen. Every request is listed in the output.
// It stops at once on HTTP 401 (wrong key) or 402 (empty wallet). It never prints or stores the key.
//
// Exit codes: 0 = at least one backend passes, 1 = none passes, 3 = no key, 4 = key rejected or wallet empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { checkDir, editPrompt, SKETCHES, PROBE_SUBJECT, PROBE_SEED, OUTPUT_SIZE, LIMITS } from "./sketch-probe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EVIDENCE = process.env.SKETCH_EVIDENCE_DIR || path.join(ROOT, "docs", "ai-evidence", "v2");
const GEN_BASE = process.env.POLLINATIONS_GEN_BASE || "https://gen.pollinations.ai";
const PRICE = { klein: 0.005, kontext: 0.03, "community/scriptsnsenses-sys/flux-2-dev-free": 0 };
const FREE_MODEL = "community/scriptsnsenses-sys/flux-2-dev-free";

/** Wording B. Like wording A (editPrompt in sketch-probe.mjs) it never says where anything is. */
export function editPromptB(subject) {
  return (
    "Convert this black-and-white line drawing into a finished picture while keeping its exact composition. " +
    `The drawing shows: ${subject}. ` +
    "Each drawn object stays in the same place, at the same size and in the same pose. Add nothing that is not drawn."
  );
}
const WORDINGS = { a: editPrompt, b: editPromptB };

function appleDrawing(cx) {
  const cy = 300;
  const body =
    `M${cx} ${cy - 78}C${cx - 40} ${cy - 110} ${cx - 100} ${cy - 80} ${cx - 95} ${cy - 10}` +
    `C${cx - 90} ${cy + 60} ${cx - 45} ${cy + 95} ${cx} ${cy + 85}C${cx + 45} ${cy + 95} ${cx + 90} ${cy + 60} ${cx + 95} ${cy - 10}` +
    `C${cx + 100} ${cy - 80} ${cx + 40} ${cy - 110} ${cx} ${cy - 78}Z`;
  const stem = `M${cx} ${cy - 78}Q${cx + 5} ${cy - 110} ${cx + 18} ${cy - 125}`;
  const leaf = `M${cx + 12} ${cy - 108}Q${cx + 50} ${cy - 135} ${cx + 70} ${cy - 105}Q${cx + 40} ${cy - 90} ${cx + 12} ${cy - 108}Z`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#fff"/>` +
    `<g fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="${body}${stem}${leaf}"/></g></svg>`
  );
}
const DRAWINGS = {
  left: { svg: appleDrawing(144), subject: PROBE_SUBJECT },
  right: { svg: appleDrawing(368), subject: PROBE_SUBJECT },
  stick: SKETCHES.stick,
  house: SKETCHES.house
};

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Stop extends Error {}
let spent = 0;
const LOG = [];
function say(line = "") {
  console.log(line);
  LOG.push(String(line));
}

/** Wallet balance visible to this key, or null when the key may not read it. Costs nothing. */
async function balance(key) {
  try {
    const response = await fetch(`${GEN_BASE}/account/balance`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const value = Number((await response.json())?.balance);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** POST /v1/images/edits with the drawing as a file upload (the request format that worked in the first probe). */
async function edit(key, model, prompt, sketch, safe) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("image", new Blob([sketch], { type: "image/png" }), "sketch.png");
  form.append("size", `${OUTPUT_SIZE}x${OUTPUT_SIZE}`);
  form.append("seed", String(PROBE_SEED));
  form.append("n", "1");
  form.append("response_format", "b64_json");
  if (safe) form.append("safe", safe);
  const started = Date.now();
  let response;
  try {
    response = await fetch(`${GEN_BASE}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(240000) });
  } catch (error) {
    return { ok: false, status: 0, note: `network error: ${error.message}`, ms: Date.now() - started };
  }
  const ms = Date.now() - started;
  if (!response.ok) {
    const note = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    return { ok: false, status: response.status, note, ms, retryAfter: Number(response.headers.get("retry-after")) || 0 };
  }
  const json = await response.json().catch(() => ({}));
  const item = json?.data?.[0] || {};
  let bytes = null;
  if (item.b64_json) bytes = Buffer.from(item.b64_json, "base64");
  else if (item.url) bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  if (!bytes || !sniffExt(bytes)) return { ok: false, status: response.status, note: "200 but no decodable image: " + JSON.stringify(json).slice(0, 200), ms };
  spent += PRICE[model] ?? 0;
  return { ok: true, status: response.status, bytes, ms };
}

async function generate(key, candidate, name, sketches, dir, meta) {
  const sketch = sketches[name];
  const prompt = WORDINGS[candidate.wording](sketch.subject);
  let result = await edit(key, candidate.model, prompt, sketch.buffer);
  if (!result.ok && result.status === 429) {
    const wait = Math.min(Math.max(result.retryAfter, 10), 70);
    say(`     (rate limited, waiting ${wait}s)`);
    await sleep(wait * 1000);
    result = await edit(key, candidate.model, prompt, sketch.buffer);
  }
  if (!result.ok && result.status === 400 && /safe/i.test(result.note || "")) {
    result = await edit(key, candidate.model, prompt, sketch.buffer, "privacy,secrets,sexual,violence,shield");
  }
  meta[name] = {
    ok: result.ok,
    status: result.status,
    seconds: Number((result.ms / 1000).toFixed(1)),
    seed: PROBE_SEED,
    prompt,
    note: result.ok ? undefined : result.note,
    request: `POST ${GEN_BASE}/v1/images/edits model=${candidate.model} size=${OUTPUT_SIZE}x${OUTPUT_SIZE} seed=${PROBE_SEED} image=<file>`
  };
  if (result.ok) fs.writeFileSync(path.join(dir, `${name}.out.${sniffExt(result.bytes)}`), result.bytes);
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  say(`     ${name.padEnd(5)} HTTP ${String(result.status).padEnd(3)} ${String(meta[name].seconds).padStart(5)}s ${result.ok ? result.bytes.length + " bytes" : String(result.note).slice(0, 150)}`);
  if (result.status === 401) throw new Stop("HTTP 401: Pollinations rejected the key. Check POLLINATIONS_API_KEY in server/.env.");
  if (result.status === 402) throw new Stop("HTTP 402: the Pollinations wallet is empty. Claim a reward at https://enter.pollinations.ai/quests (or top up), then run this again.");
  return result.ok;
}

async function runCandidate(key, candidate, sketches) {
  const dir = path.join(EVIDENCE, candidate.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const meta = { candidate: candidate.id, description: candidate.description, seed: PROBE_SEED };
  say(`\n== ${candidate.id} - ${candidate.description}`);
  const okLeft = await generate(key, candidate, "left", sketches, dir, meta);
  const okRight = okLeft && (await generate(key, candidate, "right", sketches, dir, meta));
  let gate = { pass: false, reasons: [`generation failed (HTTP ${meta.right?.status ?? meta.left?.status})`], metrics: null };
  if (okLeft && okRight) gate = await checkDir(dir);
  say(`  ${gate.pass ? "PASS" : "FAIL"}  ${gate.metrics ? JSON.stringify(gate.metrics) : ""}`);
  for (const reason of gate.reasons) say("        - " + reason);
  const separation = gate.metrics ? Number((gate.metrics.rightCentroidX - gate.metrics.leftCentroidX).toFixed(3)) : -1;
  return { ...candidate, dir, meta, pass: gate.pass, reasons: gate.reasons, metrics: gate.metrics, separation };
}

async function extras(key, result, sketches) {
  say(`\n== ${result.id} - stick figure and house`);
  for (const name of ["stick", "house"]) await generate(key, result, name, sketches, result.dir, result.meta);
  result.extras = true;
}

async function contactSheet(results, sketches) {
  const cell = 256;
  const names = ["left", "right", "stick", "house"];
  const tile = async (input) => sharp(input).resize(cell, cell, { fit: "contain", background: "#cfcfcf" }).flatten({ background: "#ffffff" }).png().toBuffer();
  const blank = await sharp({ create: { width: cell, height: cell, channels: 3, background: "#cfcfcf" } }).png().toBuffer();
  const composites = [];
  for (let row = 0; row < results.length; row++) {
    for (let col = 0; col < names.length; col++) {
      const name = names[col];
      const out = ["png", "jpg", "webp"].map((ext) => path.join(results[row].dir, `${name}.out.${ext}`)).find((file) => fs.existsSync(file));
      composites.push({ input: await tile(sketches[name].buffer), left: 6 + col * 2 * (cell + 6), top: 6 + row * (cell + 6) });
      composites.push({ input: out ? await tile(out) : blank, left: 6 + (col * 2 + 1) * (cell + 6), top: 6 + row * (cell + 6) });
    }
  }
  const file = path.join(EVIDENCE, "contact-sheet.png");
  await sharp({ create: { width: 6 + names.length * 2 * (cell + 6), height: 6 + Math.max(results.length, 1) * (cell + 6), channels: 3, background: "#808080" } }).composite(composites).png().toFile(file);
  return file;
}

async function main() {
  const key = readKey();
  if (!key) {
    console.log("POLLINATIONS_API_KEY is not set (environment or server/.env). Nothing was requested.");
    return 3;
  }
  fs.mkdirSync(path.join(EVIDENCE, "sketches"), { recursive: true });
  const sketches = {};
  for (const [name, def] of Object.entries(DRAWINGS)) {
    const file = path.join(EVIDENCE, "sketches", `${name}.png`);
    await sharp(Buffer.from(def.svg)).png().toFile(file);
    sketches[name] = { buffer: fs.readFileSync(file), subject: def.subject };
  }
  const before = await balance(key);
  say(`wallet before: ${before === null ? "unknown (this key cannot read the balance)" : before + " pollen"}`);
  const results = [];
  let stopped = null;
  try {
    for (const wording of ["a", "b"]) {
      results.push(await runCandidate(key, { id: `klein-${wording}`, model: "klein", wording, description: `klein, wording ${wording.toUpperCase()}` }, sketches));
    }
    const best = [...results].sort((x, y) => Number(y.pass) - Number(x.pass) || y.separation - x.separation)[0];
    if (best.metrics) await extras(key, best, sketches);
    if (!best.pass || process.argv.includes("--all")) {
      for (const model of [FREE_MODEL, "kontext"]) {
        const id = model === "kontext" ? "kontext" : "flux2dev-free";
        const result = await runCandidate(key, { id: `${id}-${best.wording}`, model, wording: best.wording, description: `${model}, wording ${best.wording.toUpperCase()}` }, sketches);
        results.push(result);
        if (result.pass) await extras(key, result, sketches);
      }
    }
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    stopped = error.message;
  }
  const done = results.filter((r) => r.meta);
  const sheet = await contactSheet(done, sketches);
  const winners = done.filter((r) => r.pass).map((r) => r.id);
  const summary = {
    probe: "drawing of an apple, same prompt and seed for both sides",
    subject: PROBE_SUBJECT,
    seed: PROBE_SEED,
    limits: LIMITS,
    stopped,
    estimatedPollenSpent: Number(spent.toFixed(3)),
    winners,
    results: done.map(({ dir, meta, ...rest }) => rest)
  };
  fs.writeFileSync(path.join(EVIDENCE, "summary.json"), JSON.stringify(summary, null, 2));
  say("\n================ SUMMARY (probe 2: a real drawing) ================");
  for (const r of done) say(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} ${r.metrics ? `sensitivity=${r.metrics.sensitivity} appleX(left)=${r.metrics.leftCentroidX} appleX(right)=${r.metrics.rightCentroidX}` : r.reasons.join("; ")}`);
  say(`evidence: ${path.relative(ROOT, EVIDENCE)}/  (open ${path.relative(ROOT, sheet)})`);
  const after = await balance(key);
  say(`estimated pollen spent: ${spent.toFixed(3)}${after === null ? "" : ` | wallet after: ${after} pollen`}`);
  say(stopped ? `STOPPED: ${stopped}` : winners.length ? `DRAWING-CAPABLE BACKENDS: ${winners.join(", ")}` : "DRAWING-CAPABLE BACKENDS: none");
  fs.writeFileSync(path.join(EVIDENCE, "console.txt"), LOG.join("\n") + "\n");
  if (stopped) return 4;
  return winners.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("probe crashed:", error?.message || error);
    process.exit(2);
  }
);
