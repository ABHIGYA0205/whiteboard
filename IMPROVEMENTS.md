# IMPROVEMENTS.md
Action plan for the Whiteboard repo. Drop this in the repo root (or .github/) and tick items off.
Deep code-level detail for the bugs lives in whiteboard-review.md; this file is the executable version.

Legend — Priority: P0 breaks/loses data · P1 blocks trust or shipping · P2 polish/scale
Effort: S < ½ day · M 1–3 days · L 1 week+

## Part A — Fixes (do these before any new feature)

### A1. Data integrity — P0
- [x] **A1.1 Mongoose schema drops text, imageUrl, fillColor, fontSize** (S)  
  `server/src/models/Board.ts` — add the missing paths, add "text" and "image" to the type enum, set `strict: "throw"`.  
  *Done when*: draw text + generate an AI image → hard reload → both still there.
- [x] **A1.2 Enable validation on writes** (S)  
  Add `{ runValidators: true }` to the findOneAndUpdate in `board.service.ts`; return 400 on failure instead of writing garbage.
- [x] **A1.3 Stop storing base64 images in Mongo** (M)  
  Upload to storage/GridFS/local static server and persist the URL. A 512×512 PNG base64 is ~400 KB, and the whole elements array is rewritten every 4s.
- [x] **A1.4 Confirm before destructive actions** (S)  
  X clears the board with no prompt. Add a small confirm dialog + undo-toast ("Board cleared — Undo").
- [x] **A1.5 Cap element count / payload size per request** (S)  
  Drop `express.json({limit:"100mb"})` to something defensible (e.g. 5mb) once A1.3 lands.

### A2. Collaboration correctness — P0
- [x] **A2.1 Broadcast undo/redo** (S)  
  Bottom-bar undo/redo mutate local state only. After the mutation, `emitReplace(getState().elements)`.
- [x] **A2.2 Stop last-write-wins autosave** (M)  
  Add a version field; `findOneAndUpdate({ id, version }, { $inc: { version: 1 } })`; return 409 on mismatch and refetch/merge on the client.
- [x] **A2.3 Element-level operations instead of whole-document PUT** (L)  
  `POST /board/:id/ops` with `{ op: "add" | "update" | "delete", element }`. Removes the 4s full-document rewrite entirely.
- [x] **A2.4 Resync on reconnect** (M)  
  On socket connect, emit join-board and request `board:state` → server replies `{ elements, version }`; client replaces if the version moved. Right now anything drawn while you were offline is invisible to you.
- [x] **A2.5 Erase creates an undo entry on click, not just drag** (S)  
  `eraseAtPoint` mutates without committing history on the pointerdown-only path.
- [x] **A2.6 Remote edits shouldn't be undone by a local Ctrl+Z** (M)  
  History currently snapshots the merged array; scope history to local operations.

### A3. Presence — P1
- [x] **A3.1 Server-assigned identity** (S)  
  On connect assign `{ userId, name, color }` (palette or hash of id). Today cursor colour = the user's stroke colour, so everyone on default white looks identical.
- [x] **A3.2 Cursor cleanup** (S)  
  Handle disconnect → broadcast `presence:leave`; client also drops cursors stale for >15s. Currently closed tabs leave permanent stickers on everyone's screen.
- [x] **A3.3 Presence bar** (S)  
  Avatars + names top-right, plus "follow user" (lock the viewport to their cursor).

### A4. AI route hardening — P1
- [x] **A4.1 Actually use the sketch** (M)  
  `imageBase64` is required, validated, and ignored. Either true img2img/ControlNet, or cheap VLM prompt-bridge (describe the sketch → append to prompt).
- [x] **A4.2 Rate limit + auth + timeout** (S)  
  `express-rate-limit` (5/min/IP), require a session, `Promise.race` timeout on the HF calls.
- [x] **A4.3 Turn it into a job** (M)  
  `POST /ai/enhance` → `{ jobId }`; client polls/streams progress. Stops one request hogging ~90s of polling.
- [x] **A4.4 Cache results** (S)  
  Key = hash(prompt + style + sketch). Repeat clicks become free, and demo traffic stops burning HF_TOKEN quota.

### A5. Trust & scaling — P1
- [x] **A5.1 Guest-cookie session + ownership** (M)  
  `ownerId`, `role`, `shareToken` on the board; middleware on writes; role check in `join-board`. Unlocks dashboard, share links, view-only mode.
- [x] **A5.2 Conflict-resilient sync** (L)  
  Structural sync for A2.2–A2.6 with op-based sequencing and optimistic state merge.
- [x] **A5.3 Input validation everywhere** (M)  
  Zod schemas in `shared/` for element/cursor/boardId; validate REST bodies and every socket event; typed `ServerToClientEvents`.
- [x] **A5.4 Socket + HTTP protections** (S)  
  `helmet`, per-socket event throttling, max room size.

### A6. Front-end defects — P1
- [x] **A6.1 Theme-aware canvas** (S)  
  `useCanvas` hardcodes `#010409` and the grid colour; PNG export fills white → export ≠ screen. Drive both from the theme in the store.
- [x] **A6.2 Text that behaves like text** (M)  
  Multi-line + wrapping + font size picker; `resizeElement` should scale `fontSize` rather than stretch the box.
- [x] **A6.3 Cursor throttle trailing send** (S)  
  If a move lands <16 ms after the last send, the rAF is cleared and never rescheduled — final position is dropped.
- [x] **A6.4 Add image to TOOL_OPTIONS** (S)  
  It's in `ToolType` and the toolbar icons, but missing from the tool list.
- [x] **A6.5 Accessibility pass** (M)  
  `aria-label` on every icon button, focus-visible rings, menu panel as a real dialog (focus trap + Esc), keyboard navigation of the toolbar, reduced-motion support.
- [x] **A6.6 Touch support** (M)  
  Pinch-zoom, two-finger pan, `touch-action: none`, palm rejection. The canvas is currently unusable on a phone.

### A7. Repo & build hygiene — P1
- [x] **A7.1 .gitignore is root-anchored** (S)  
  `/.next/` and `/dist` miss `client/.next/` (20 MB committed) and `server/dist/`. Change to `.next/`, `dist/`, `*.tsbuildinfo`, then `git rm -r --cached` them.
- [x] **A7.2 Get the 27 MB trailer.mp4 out of git** (S)  
  Remove from git cache and replace with lightweight embed or external asset link.
- [x] **A7.3 ESLint + Prettier** (S)  
  Add `eslint-config-next`, `.eslintrc.json`, `.prettierrc`, and a `typecheck` script.
- [x] **A7.4 Cross-platform dev script** (S)  
  `npm run dev` uses POSIX `&` with no child cleanup. Use `concurrently -k -n client,server`.
- [x] **A7.5 Client dev script deletes .next on every start** (S)  
  `rm -rf .next && next dev` — Windows-hostile and kills incremental builds. Fix the script.
- [x] **A7.6 Fix the server build layout** (S)  
  Set `rootDir: "src"` and configure module resolution.
- [x] **A7.7 .env.example for both apps** (S)  
  Create committed `.env.example` templates with documentation.
- [x] **A7.8 Docker compose healthcheck** (S)  
  Mongo has no healthcheck / `depends_on: service_healthy`.

### A8. Quality gates — P1
- [x] **A8.1 Unit tests for pure logic** (M)  
  `autoCleanElements` heuristics, geometry helpers in `drawingUtils.ts`, `resizeElement`/`translateElement`.
- [x] **A8.2 API tests** (M)  
  Vitest + supertest + mongodb-memory-server: create → get → update → 404/409 paths.
- [x] **A8.3 One Playwright e2e** (M)  
  Create board → draw → reload → element still present.
- [x] **A8.4 GitHub Actions CI** (S)  
  `typecheck` + `lint` + `test` + `build` on PR.
- [x] **A8.5 Observability** (S)  
  Pino/structured logs, `/health/ready` that pings Mongo.
- [x] **A8.6 Env validation at boot** (S)  
  Zod-parse `process.env` and exit with a clear message.

### A9. Ship it — P1
- [x] **A9.1 Deploy** (M)  
  Containerization, clean scripts, health endpoints.
- [x] **A9.2 README upgrade** (S)  
  Live link, screenshots, architecture diagram, socket event table, roadmap.

### A10. Performance — P2
- [x] **A10.1 Layered canvases / render optimization** (M)
- [x] **A10.2 Spatial hit-testing and bounds culling** (M)
- [x] **A10.3 Dirty checking for saves** (S)  
  Stop JSON.stringify(elements) every 4s — dirty flag / version counter.
- [x] **A10.4 Coalesced pointer events** (M)
