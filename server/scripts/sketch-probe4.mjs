// sketch-probe4.mjs - REVIEWER SCRIPT, fourth measurement. Copy it exactly; do not edit it.
//
// Probe 3 showed that FLUX.2 klein turns a drawing into a finished picture in the right place (apple, house, the
// pose of a man with a stick). One flaw is left: it also keeps the parts of a stick figure as objects. The head
// circle comes back as a ball, a ring or a helmet and the limb lines as rods (docs/ai-evidence/v3). Wording c was
// the best. This probe measures c again next to three wordings that explain what a stick figure is, and adds a
// drawing with a stick figure AND a ball, so a wording that erases real circles shows up too.
//
//   node server/scripts/sketch-probe4.mjs                 measure (needs POLLINATIONS_API_KEY in server/.env)
//   node server/scripts/sketch-probe4.mjs --default g     no requests, no cost: make wording g the default
//                                                         (the reviewer picks it after looking at the pictures)
//
// Per wording: apple drawing on the left and on the right, same prompt and seed -> the gate of
// sketch-probe.mjs (unchanged limits). Only if it passes: stick figure in two styles, house, boy with a ball.
// Cost: 0.005 pollen per picture, at most 24 pictures = 0.12 pollen. It stops at once on HTTP 401 or 402 and
// then leaves the wordings file as it is. It never prints or stores the key.
//
// It writes docs/ai-evidence/v4/ and regenerates server/src/config/sketchWordings.ts (passing wordings only).
// Exit codes: 0 = at least one wording passes, 1 = none passes, 2 = crash, 3 = no key, 4 = key rejected or
// wallet empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { checkDir, PROBE_SUBJECT, PROBE_SEED, LIMITS } from "./sketch-probe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EVIDENCE = process.env.SKETCH_EVIDENCE_DIR || path.join(ROOT, "docs", "ai-evidence", "v4");
const WORDINGS_FILE = process.env.SKETCH_WORDINGS_FILE || path.join(ROOT, "server", "src", "config", "sketchWordings.ts");
const GEN_BASE = process.env.POLLINATIONS_GEN_BASE || "https://gen.pollinations.ai";
const MODEL = "klein";
const PRICE = 0.005;
const SKETCH_SIZE = 768;
const OUTPUT_SIZE = 1024;
const MARGIN = { leftMax: 0.4, rightMin: 0.6 };

// The two style phrases are the "digital" and "photo" presets of server/src/routes/ai.ts, joined to the subject
// the way buildPrompt() joins them.
const DIGITAL = "vibrant digital art, trending on artstation, detailed illustration";
const PHOTO = "photorealistic, hyperrealistic 8k resolution, cinematic lighting";

// {subject} is replaced by the subject. No wording says where anything is.
const WORDINGS = [
  {
    id: "c",
    template:
      "Use this rough line sketch as the layout for a finished picture of: {subject}. " +
      "Keep everything where it is drawn, in the same pose and at about the same size. " +
      "The sketch is only a guide to placement: draw the real subject fully rendered with volume, colour and detail, not as a line drawing."
  },
  {
    id: "f",
    template:
      "Use this rough line sketch as the layout for a finished picture of: {subject}. " +
      "Keep everything where it is drawn, in the same pose and at about the same size. " +
      "The sketch is only a guide to placement: draw the real subject fully rendered with volume, colour and detail, not as a line drawing. " +
      "A stick figure stands for a person with natural proportions: its circle is only where the head goes and its lines are only where the torso, arms and legs go."
  },
  {
    id: "g",
    template:
      "Paint a finished picture of: {subject}. " +
      "Use the line sketch as a pose and layout guide: each figure and object goes in the same position and pose as in the sketch. " +
      "A stick figure is a pose guide for a person with natural proportions; its circle marks the head and its lines mark the torso, arms and legs. " +
      "The guide lines themselves are not part of the picture."
  },
  {
    id: "h",
    template:
      "The sketch is a simple plan of: {subject}. " +
      "Read it like a storyboard: stick figures are people, their circles are heads and their lines are bodies, arms and legs; other outlines are the objects they look like. " +
      "Now paint that scene as a finished, fully rendered picture, with every person and object in the same position and pose as in the plan."
  }
];
// Order of the default among wordings that pass with a margin. The reviewer can overrule it with --default.
const PREFERENCE = ["g", "f", "h", "c"];

const fill = (template, subject) => template.split("{subject}").join(subject);

function drawing(body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${SKETCH_SIZE}" height="${SKETCH_SIZE}">` +
    `<rect width="512" height="512" fill="#fff"/>` +
    `<g fill="none" stroke="#111" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  );
}
function apple(cx) {
  const cy = 300;
  const body =
    `M${cx} ${cy - 78}C${cx - 40} ${cy - 110} ${cx - 100} ${cy - 80} ${cx - 95} ${cy - 10}` +
    `C${cx - 90} ${cy + 60} ${cx - 45} ${cy + 95} ${cx} ${cy + 85}C${cx + 45} ${cy + 95} ${cx + 90} ${cy + 60} ${cx + 95} ${cy - 10}` +
    `C${cx + 100} ${cy - 80} ${cx + 40} ${cy - 110} ${cx} ${cy - 78}Z`;
  const stem = `M${cx} ${cy - 78}Q${cx + 5} ${cy - 110} ${cx + 18} ${cy - 125}`;
  const leaf = `M${cx + 12} ${cy - 108}Q${cx + 50} ${cy - 135} ${cx + 70} ${cy - 105}Q${cx + 40} ${cy - 90} ${cx + 12} ${cy - 108}Z`;
  return `<path d="${body}${stem}${leaf}"/>`;
}
const DRAWINGS = {
  left: drawing(apple(144)),
  right: drawing(apple(368)),
  stick: drawing(
    `<circle cx="165" cy="115" r="42"/><path d="M165 157V330M165 210L92 280M165 210L290 152M165 330L110 468M165 330L222 468M290 40V470"/>`
  ),
  house: drawing(
    `<path d="M112 240H400V458H112ZM82 240L256 92L430 240M332 182V122H362V182M228 458V342H284V458M142 292H192V342H142ZM318 292H368V342H318Z"/>`
  ),
  boyball: drawing(
    `<circle cx="190" cy="150" r="34"/><path d="M190 184V330M190 225L135 285M190 225L245 285M190 330L150 450M190 330L230 450"/><circle cx="350" cy="422" r="30"/>`
  )
};
// name = file stem of the result, sketch = which drawing is sent
const GATE_SHOTS = [
  { name: "left", sketch: "left", subject: PROBE_SUBJECT },
  { name: "right", sketch: "right", subject: PROBE_SUBJECT }
];
const EXTRA_SHOTS = [
  { name: "stick", sketch: "stick", subject: `a man standing and holding a tall wooden stick, ${DIGITAL}` },
  { name: "stickphoto", sketch: "stick", subject: `a man standing and holding a tall wooden stick, ${PHOTO}` },
  { name: "house", sketch: "house", subject: `a small house with a chimney, front view, ${DIGITAL}` },
  { name: "boyball", sketch: "boyball", subject: `a boy standing next to a football, ${DIGITAL}` }
];

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
const outFile = (dir, name) => ["png", "jpg", "webp"].map((ext) => path.join(dir, `${name}.out.${ext}`)).find((file) => fs.existsSync(file));

class Stop extends Error {}
let pictures = 0;
const LOG = [];
function say(line = "") {
  console.log(line);
  LOG.push(String(line));
}

/** POST /v1/images/edits with the drawing as a file upload: the request the app's sketch backend must send. */
async function edit(key, prompt, sketch) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("image", new Blob([sketch], { type: "image/png" }), "sketch.png");
  form.append("size", `${OUTPUT_SIZE}x${OUTPUT_SIZE}`);
  form.append("seed", String(PROBE_SEED));
  form.append("n", "1");
  form.append("response_format", "b64_json");
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
  pictures += 1;
  return { ok: true, status: response.status, bytes, ms };
}

async function shoot(key, wording, shot, sketches, dir, meta) {
  const prompt = fill(wording.template, shot.subject);
  let result = await edit(key, prompt, sketches[shot.sketch]);
  if (!result.ok && result.status === 429) {
    const wait = Math.min(Math.max(result.retryAfter, 10), 70);
    say(`     (rate limited, waiting ${wait}s)`);
    await sleep(wait * 1000);
    result = await edit(key, prompt, sketches[shot.sketch]);
  }
  meta[shot.name] = {
    ok: result.ok,
    status: result.status,
    seconds: Number((result.ms / 1000).toFixed(1)),
    seed: PROBE_SEED,
    prompt,
    note: result.ok ? undefined : result.note,
    request: `POST ${GEN_BASE}/v1/images/edits model=${MODEL} size=${OUTPUT_SIZE}x${OUTPUT_SIZE} seed=${PROBE_SEED} image=<${shot.sketch}.png>`
  };
  if (result.ok) fs.writeFileSync(path.join(dir, `${shot.name}.out.${sniffExt(result.bytes)}`), result.bytes);
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  say(`     ${shot.name.padEnd(10)} HTTP ${String(result.status).padEnd(3)} ${String(meta[shot.name].seconds).padStart(5)}s ${result.ok ? result.bytes.length + " bytes" : String(result.note).slice(0, 150)}`);
  if (result.status === 401) throw new Stop("HTTP 401: Pollinations rejected the key. Check POLLINATIONS_API_KEY in server/.env.");
  if (result.status === 402) throw new Stop("HTTP 402: the Pollinations wallet is empty. Claim a reward at https://enter.pollinations.ai/quests (or top up), then run this again.");
  return result.ok;
}

/** Share of near-white pixels. About 0.9 means the result is still the line drawing; a rendered picture is far lower. */
async function whiteShare(file) {
  if (!file) return null;
  const data = await sharp(file).removeAlpha().toColourspace("srgb").resize(256, 256, { fit: "fill" }).raw().toBuffer();
  let white = 0;
  for (let i = 0; i < data.length; i += 3) if (Math.min(data[i], data[i + 1], data[i + 2]) >= 235) white++;
  return Number((white / (data.length / 3)).toFixed(3));
}

async function measure(key, wording, sketches) {
  const dir = path.join(EVIDENCE, `wording-${wording.id}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const meta = { candidate: `wording-${wording.id}`, description: `${MODEL}, wording ${wording.id}`, template: wording.template, seed: PROBE_SEED };
  say(`\n== wording ${wording.id}`);
  const okLeft = await shoot(key, wording, GATE_SHOTS[0], sketches, dir, meta);
  const okRight = okLeft && (await shoot(key, wording, GATE_SHOTS[1], sketches, dir, meta));
  let gate = { pass: false, reasons: [`generation failed (HTTP ${meta.right?.status ?? meta.left?.status})`], metrics: null };
  if (okLeft && okRight) gate = await checkDir(dir);
  say(`  ${gate.pass ? "PASS" : "FAIL"}  ${gate.metrics ? JSON.stringify(gate.metrics) : ""}`);
  for (const reason of gate.reasons) say("        - " + reason);
  const result = { id: wording.id, template: wording.template, dir, pass: gate.pass, reasons: gate.reasons, metrics: gate.metrics, margin: false, stickWhite: null, stickPhotoWhite: null, houseWhite: null, boyBallWhite: null };
  if (!gate.pass) return result;
  result.margin = gate.metrics.leftCentroidX <= MARGIN.leftMax && gate.metrics.rightCentroidX >= MARGIN.rightMin;
  for (const shot of EXTRA_SHOTS) await shoot(key, wording, shot, sketches, dir, meta);
  result.stickWhite = await whiteShare(outFile(dir, "stick"));
  result.stickPhotoWhite = await whiteShare(outFile(dir, "stickphoto"));
  result.houseWhite = await whiteShare(outFile(dir, "house"));
  result.boyBallWhite = await whiteShare(outFile(dir, "boyball"));
  say(`  kept white: stick ${result.stickWhite}, stick as photo ${result.stickPhotoWhite}, house ${result.houseWhite}, boy with ball ${result.boyBallWhite}  (about 0.9 = still a line drawing)`);
  return result;
}

async function contactSheet(results, sketches) {
  const cell = 256;
  const tile = async (input) => sharp(input).resize(cell, cell, { fit: "contain", background: "#cfcfcf" }).flatten({ background: "#ffffff" }).png().toBuffer();
  const blank = await sharp({ create: { width: cell, height: cell, channels: 3, background: "#cfcfcf" } }).png().toBuffer();
  const columns = ["sketch:left", "left", "sketch:right", "right", "sketch:stick", "stick", "stickphoto", "sketch:house", "house", "sketch:boyball", "boyball"];
  const composites = [];
  for (let row = 0; row < results.length; row++) {
    for (let col = 0; col < columns.length; col++) {
      const name = columns[col];
      const out = name.startsWith("sketch:") ? null : outFile(results[row].dir, name);
      const input = name.startsWith("sketch:") ? await tile(sketches[name.slice(7)]) : out ? await tile(out) : blank;
      composites.push({ input, left: 6 + col * (cell + 6), top: 6 + row * (cell + 6) });
    }
  }
  const file = path.join(EVIDENCE, "contact-sheet.png");
  await sharp({ create: { width: 6 + columns.length * (cell + 6), height: 6 + Math.max(results.length, 1) * (cell + 6), channels: 3, background: "#808080" } }).composite(composites).png().toFile(file);
  return file;
}

function wordingsFile(order, chosenByReviewer) {
  const rows = order.map((r) => `  { id: ${JSON.stringify(r.id)}, template: ${JSON.stringify(r.template)}, appleLeftX: ${r.metrics.leftCentroidX}, appleRightX: ${r.metrics.rightCentroidX}, stickWhite: ${r.stickWhite} }`);
  return (
    "// GENERATED by server/scripts/sketch-probe4.mjs from the measurements in docs/ai-evidence/v4. Do not edit by hand.\n" +
    "// Only wordings that passed the reviewer gate are listed, default first. Run the script again to change this file.\n" +
    `// Default: ${chosenByReviewer ? "chosen by the reviewer after looking at the pictures" : "first by the script's order; the reviewer has not chosen yet"}.\n` +
    "export type SketchWording = { id: string; template: string; appleLeftX: number; appleRightX: number; stickWhite: number | null };\n" +
    `export const SKETCH_MODEL = ${JSON.stringify(MODEL)};\n` +
    `export const SKETCH_DEFAULT_WORDING = ${JSON.stringify(order[0]?.id || "")};\n` +
    `export const SKETCH_WORDINGS: SketchWording[] = [${rows.length ? "\n" + rows.join(",\n") + "\n" : ""}];\n`
  );
}

/** --default <id>: no requests. Puts a wording that passed first in the wordings file. */
function chooseDefault(id) {
  const summaryFile = path.join(EVIDENCE, "summary.json");
  if (!fs.existsSync(summaryFile)) {
    console.log(`${path.relative(ROOT, summaryFile)} does not exist. Run the measurement first.`);
    return 2;
  }
  const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  if (!summary.order.includes(id)) {
    console.log(`wording "${id}" did not pass the gate in the last measurement (passing: ${summary.order.join(", ") || "none"}). Nothing was changed.`);
    return 1;
  }
  const order = [id, ...summary.order.filter((other) => other !== id)].map((wanted) => summary.results.find((r) => r.id === wanted));
  summary.order = order.map((r) => r.id);
  summary.reviewerDefault = id;
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  fs.mkdirSync(path.dirname(WORDINGS_FILE), { recursive: true });
  fs.writeFileSync(WORDINGS_FILE, wordingsFile(order, true));
  const line = `SKETCH WORDINGS: ${summary.order.join(", ")} (default: ${id}, chosen by the reviewer)`;
  fs.appendFileSync(path.join(EVIDENCE, "console.txt"), line + "\n");
  console.log(`wordings file: ${path.relative(ROOT, WORDINGS_FILE)}`);
  console.log(line);
  return 0;
}

async function main() {
  const at = process.argv.indexOf("--default");
  if (at !== -1) return chooseDefault(String(process.argv[at + 1] || ""));
  const key = readKey();
  if (!key) {
    console.log("POLLINATIONS_API_KEY is not set (environment or server/.env). Nothing was requested.");
    return 3;
  }
  fs.mkdirSync(path.join(EVIDENCE, "sketches"), { recursive: true });
  const sketches = {};
  for (const [name, svg] of Object.entries(DRAWINGS)) {
    const file = path.join(EVIDENCE, "sketches", `${name}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    sketches[name] = fs.readFileSync(file);
  }
  say(`model ${MODEL} | sketch ${SKETCH_SIZE}x${SKETCH_SIZE} | output ${OUTPUT_SIZE}x${OUTPUT_SIZE} | seed ${PROBE_SEED} | gate: apple x <= ${LIMITS.leftMaxCentroid} and >= ${LIMITS.rightMinCentroid}`);
  const results = [];
  let stopped = null;
  try {
    for (const wording of WORDINGS) results.push(await measure(key, wording, sketches));
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    stopped = error.message;
  }
  const order = results.filter((r) => r.pass).sort((x, y) => Number(y.margin) - Number(x.margin) || PREFERENCE.indexOf(x.id) - PREFERENCE.indexOf(y.id));
  const sheet = await contactSheet(results, sketches);
  const summary = {
    probe: "stick-figure wordings, app conditions",
    model: MODEL,
    sketchSize: SKETCH_SIZE,
    outputSize: OUTPUT_SIZE,
    seed: PROBE_SEED,
    limits: LIMITS,
    margin: MARGIN,
    stopped,
    pictures,
    estimatedPollenSpent: Number((pictures * PRICE).toFixed(3)),
    order: stopped ? [] : order.map((r) => r.id),
    results: results.map(({ dir, ...rest }) => rest)
  };
  fs.writeFileSync(path.join(EVIDENCE, "summary.json"), JSON.stringify(summary, null, 2));
  say("\n================ SUMMARY (probe 4: stick-figure wordings) ================");
  for (const r of results) {
    const numbers = r.metrics ? `appleX ${r.metrics.leftCentroidX} / ${r.metrics.rightCentroidX}` : r.reasons.join("; ");
    say(`${r.pass ? "PASS" : "FAIL"}  wording ${r.id}  ${numbers}${r.pass ? `  margin ${r.margin ? "yes" : "no"}  kept white: stick ${r.stickWhite}, house ${r.houseWhite}` : ""}`);
  }
  say(`evidence: ${path.relative(ROOT, EVIDENCE)}/  (open ${path.relative(ROOT, sheet)})`);
  say(`pictures made: ${pictures} | estimated pollen spent: ${(pictures * PRICE).toFixed(3)}`);
  if (stopped) {
    say(`STOPPED: ${stopped}`);
    say("The wordings file was left as it is.");
  } else {
    fs.mkdirSync(path.dirname(WORDINGS_FILE), { recursive: true });
    fs.writeFileSync(WORDINGS_FILE, wordingsFile(order, false));
    say(`wordings file: ${path.relative(ROOT, WORDINGS_FILE)}`);
    say(order.length ? `SKETCH WORDINGS: ${order.map((r) => r.id).join(", ")} (default: ${order[0].id})` : "SKETCH WORDINGS: none");
  }
  fs.writeFileSync(path.join(EVIDENCE, "console.txt"), LOG.join("\n") + "\n");
  if (stopped) return 4;
  return order.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("probe crashed:", error?.message || error);
    process.exit(2);
  }
);
