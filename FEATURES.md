# FEATURES.md — new feature backlog

Ideas you **don't** have yet, ordered so that each group builds on what's already in the repo.
`Impact` = user-visible value / how much it differentiates you. `Effort` = `S` ½ day · `M` 1–3 days · `L` 1 week+.

**Already shipped (don't re-count):** infinite pan/zoom canvas · pencil, rect, circle, line, arrow, text, image, eraser, select, pan · drag/resize · undo/redo · live cursors · Mongo persistence + 4s autosave · JSON & PNG export · auto-clean heuristics · AI sketch→image (HF + AI Horde) · canvas lock · dark-ish UI.

---

## F1. Table stakes — the gap vs. Excalidraw / tldraw

Users who have used any whiteboard will notice these are missing within 30 seconds.

| # | Feature | What it actually is | Impact | Effort | Status |
|---|---|---|---|---|---|
| F1.1 | **Marquee multi-select** | Shift+drag rubber band; move/delete/style a group at once | ★★★★★ | M | Backlog |
| F1.2 | **Copy / paste / duplicate** | `Cmd+C/V`, `Cmd+D` clone, paste image straight from clipboard | ★★★★★ | M | **Done** |
| F1.3 | **Sticky notes** | One element type: rect + wrapping text + shadow + auto-grow | ★★★★★ | S | **Done** |
| F1.4 | **Image upload** | Drag & drop / paste / file picker → object storage → element | ★★★★★ | S | **Done** |
| F1.5 | **Arrow binding** | Anchors stick to shapes and re-route when shapes move | ★★★★★ | M | Backlog |
| F1.6 | **Z-order controls** | Bring to front/back, forward/backward (`[`, `]`, `Shift+[`, `Shift+]`) | ★★★★ | S | **Done** |
| F1.7 | **Snapping + alignment guides** | Snap to edges/centres, show guides, equal-spacing hints | ★★★★ | M | Backlog |
| F1.8 | **`perfect-freehand` strokes** | Pressure/velocity taper so pencil feels like ink, not a polyline | ★★★★ | S | Backlog |
| F1.9 | **Text that behaves** | Multi-line, wrapping, font family/size picker, alignment | ★★★★ | M | Backlog |
| F1.10 | **Shape styling** | Dashed/dotted strokes, opacity, fills/patterns, rounded corners, elbow/curved lines | ★★★★ | S | Backlog |
| F1.11 | **SVG / PDF export** | Vector SVG export (`exportToSvg`) with precise bounds & styling | ★★★★ | M | **Done** |
| F1.12 | **Frames / sections** | Named regions that scope export and organise the canvas | ★★★ | M | Backlog |
| F1.13 | **Shortcut cheat-sheet (`?`)** | Interactive keyboard modal showing tools, clipboard, z-order, viewport | ★★★ | S | **Done** |
| F1.14 | **Touch & mobile** | Touch action none, pinch-zoom, two-finger pan, responsive UI | ★★★★ | M | **Done** |
| F1.15 | **Object lock/hide per element** | Distinct from the existing whole-canvas lock | ★★★ | S | Backlog |
| F1.16 | **Eraser modes** | Stroke-erase vs. delete-whole-element; eraser cursor preview | ★★ | S | Backlog |

---

## F2. Collaboration depth (your differentiator)

| # | Feature | Notes | Impact | Effort | Status |
|---|---|---|---|---|---|
| F2.1 | **Share links + roles** | `?role=viewer` read-only links; locks canvas and shows badge | ★★★★★ | M | **Done** |
| F2.2 | **Presence bar + follow-cam** | Avatars, names, click to "follow" a collaborator's viewport | ★★★★★ | S–M | **Done** |
| F2.3 | **Comment threads** | Pin to canvas coords, reply, resolve, filter open/resolved | ★★★★ | L | Backlog |
| F2.4 | **Version history / time travel** | Snapshot every N ops, scrub + restore, "who changed this" | ★★★★ | L | Backlog |
| F2.5 | **Laser pointer** | Ephemeral glowing trail for presenting (`K` key / tool) | ★★★★ | S | **Done** |
| F2.6 | **Selection awareness** | See which element each user has selected (coloured outline) | ★★★ | S | Backlog |
| F2.7 | **In-board chat / reactions** | Lightweight, or a room-chat panel in the sidebar | ★★★ | S | Backlog |
| F2.8 | **Notifications / mentions** | `@name` in a comment → toast / email | ★★ | M | Backlog |
| F2.9 | **Recording / playback** | Replay a session from the op log — great demo artifact | ★★★ | L | Backlog |
| F2.10 | **CRDT sync (Yjs)** | Concurrent edits merge instead of clobbering — replaces last-write-wins | ★★★★★ | L | Backlog |
| F2.11 | **Redis adapter + rooms** | Horizontal scale, board TTL, server-side rate limits | ★★★ | S–M | Backlog |
| F2.12 | **Live embed / read-only presenter mode** | Strip all chrome, present to an audience URL | ★★★ | S | Backlog |

---

## F3. AI — the features people will screenshot

You already have the model plumbing; these are the ones that make it feel intelligent.

| # | Feature | Notes | Impact | Effort | Status |
|---|---|---|---|---|---|
| F3.1 | **Real sketch → image** | img2img / ControlNet so the drawing actually conditions the result | ★★★★★ | M | Backlog |
| F3.2 | **Prompt → diagram** | Prompt emits native editable `rect`, `arrow`, `text` elements laid out nicely | ★★★★★ | M | **Done** |
| F3.3 | **ML-grade shape recognition** | `$1 Unistroke Recognizer` (~80 LOC) for arrows/triangles/stars | ★★★★ | M | Backlog |
| F3.4 | **Handwriting → text** | Capture region → VLM/OCR → replace strokes with a text element | ★★★★ | M | Backlog |
| F3.5 | **"Tidy my board"** | Cluster + auto-layout into a grid using your existing bounds math | ★★★★ | M | Backlog |
| F3.6 | **Board → summary / action items** | LLM over text elements; export as Markdown checklist | ★★★ | S | Backlog |
| F3.7 | **Board → slides** | Frame-based deck generation | ★★★ | M | Backlog |
| F3.8 | **Style transfer on a selection** | "make this look like a whiteboard sketch / blueprint / neon" | ★★★ | M | Backlog |
| F3.9 | **Alt-text for every element** | Accessibility win + a nice line in the README | ★★★ | S | Backlog |
| F3.10 | **Streaming progress + job queue** | `POST /ai/enhance` -> jobId, `GET /ai/job/:id` polling with progress | ★★★★ | M | **Done** |
| F3.11 | **Prompt suggestions / style chips** | Style presets (Digital, Sketch, Oil, Anime, Cyberpunk, 3D Render) | ★★ | S | **Done** |
| F3.12 | **Voice → notes** | Speech-to-text → sticky notes | ★★ | M | Backlog |

---

## F4. Product surface (turn the demo into an app)

| # | Feature | Notes | Impact | Effort | Status |
|---|---|---|---|---|---|
| F4.1 | **"My boards" dashboard** | Grid of boards with thumbnails, rename, duplicate, delete, search | ★★★★★ | M | Backlog |
| F4.2 | **Auth** | Magic-link / Google; guest cookie first, real accounts after | ★★★★★ | M | Backlog |
| F4.3 | **Templates gallery** | Flowchart, retro, kanban, mind map → editable seed structures | ★★★★★ | M | **Done** |
| F4.4 | **Landing page → product loop** | Public template pages + OG images for share links | ★★★ | S | Backlog |
| F4.5 | **Board permissions & transfer** | Owner/editor/viewer, invite by email, ownership transfer | ★★★ | M | Backlog |
| F4.6 | **Search across boards** | Full-text over text elements ("where did I write 'pricing'?") | ★★★ | M | Backlog |
| F4.7 | **Embed objects** | YouTube / Figma / Loom / iframe element type | ★★★ | M | Backlog |
| F4.8 | **Import** | `.excalidraw`, draw.io, Miro CSV, Markdown outline → elements | ★★★ | L | Backlog |
| F4.9 | **PWA + offline** | Installable, works offline, syncs on reconnect | ★★★ | M | Backlog |
| F4.10 | **Billing / usage caps** | Stripe test mode + AI credits | ★★ | L | Backlog |
| F4.11 | **Analytics** | Posthog: boards created, elements drawn, AI runs, retention | ★★ | S | Backlog |
| F4.12 | **i18n** | Next.js locale routing; even 2 languages is a nice signal | ★★ | M | Backlog |

---

## F5. Power-user / niche differentiators (pick one and own it)

| # | Feature | Why it could stand out | Status |
|---|---|---|---|
| F5.1 | **Diagram-from-code** | Paste Mermaid/PlantUML → native editable elements (not an image) | Backlog |
| F5.2 | **Infinite canvas "minimap"** | Collapsible interactive minimap with viewport camera rectangle | **Done** |
| F5.3 | **Plugin/extension API** | Register custom element renderers — the tldraw playbook | Backlog |
| F5.4 | **Whiteboard → working React UI** | Sketch a form → AI emits component code. Highest "wow" per line | Backlog |
| F5.5 | **Meeting mode** | Timer, agenda frames, auto-captured notes, recap sent to Slack | Backlog |
| F5.6 | **Multiplayer cursor chat** | Figma-style press-and-type bubble; tiny feature, disproportionate delight | Backlog |
| F5.7 | **Board-to-board links** | Click an element → jump to another board (nested knowledge base) | Backlog |
| F5.8 | **Public embed widget** | `<iframe>` a read-only board on any site | Backlog |
| F5.9 | **Keyboard-first command palette** (`Cmd+K`) | 20 actions, no menus; power users love it | Backlog |
| F5.10 | **Hindi / regional-language handwriting** | Recognise Devanagari strokes locally — genuinely underserved | Backlog |
