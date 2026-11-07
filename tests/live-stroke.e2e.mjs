// Proves: (1) client B's first received event for a newly drawn stroke is `draw` (not `draw-progress`),
//          (2) subsequent `draw-progress` deltas stream through,
//          (3) a late-joining client C receives the full stroke with all accumulated points from the server live mirror.
import { io } from "socket.io-client";

const API = process.env.API_URL || "http://127.0.0.1:4001";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + JSON.stringify(detail) : ""}`);
};

const boardRes = await fetch(`${API}/board`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}"
});
if (!boardRes.ok) {
  console.error("Failed to create board:", await boardRes.text());
  process.exit(1);
}
const board = (await boardRes.json()).id;

// Client A (drawer) and Client B (peer) join the board
const clientA = io(API, { transports: ["websocket"], auth: { userId: "drawer-a" } });
await new Promise((r) => clientA.on("connect", r));
clientA.emit("join-board", { boardId: board, userName: "drawer-a" });

const clientB = io(API, { transports: ["websocket"], auth: { userId: "peer-b" } });
await new Promise((r) => clientB.on("connect", r));
clientB.emit("join-board", { boardId: board, userName: "peer-b" });

await sleep(300);

const strokeId = "live-pencil-stroke-1";
const receivedEvents = [];

clientB.on("draw", ({ element }) => {
  if (element?.id === strokeId) {
    receivedEvents.push({ type: "draw", element });
  }
});

clientB.on("draw-progress", (payload) => {
  if (payload?.elementId === strokeId) {
    receivedEvents.push({ type: "draw-progress", points: payload.points });
  }
});

// Client A creates and announces the pencil element at pointerdown
const initialPencilElement = {
  id: strokeId,
  type: "pencil",
  x: 50,
  y: 50,
  width: 2,
  height: 2,
  strokeColor: "#ffffff",
  strokeWidth: 2,
  points: [{ x: 50, y: 50 }]
};

clientA.emit("draw", { boardId: board, element: initialPencilElement });

// Client A streams 50 draw-progress deltas
for (let i = 1; i <= 50; i++) {
  clientA.emit("draw-progress", {
    boardId: board,
    elementId: strokeId,
    points: [{ x: 50 + i, y: 50 + i }],
    x: 50,
    y: 50,
    width: 2 + i,
    height: 2 + i
  });
}

await sleep(600);

// (1) Assert client B's first received event referencing that elementId is `draw` (not `draw-progress`)
check(
  "Client B first received event for element is `draw`",
  receivedEvents.length > 0 && receivedEvents[0].type === "draw",
  { firstEventType: receivedEvents[0]?.type, totalEvents: receivedEvents.length }
);

// (2) Assert client B received all 50 draw-progress events
const progressEvents = receivedEvents.filter((e) => e.type === "draw-progress");
check(
  "Client B received all 50 draw-progress events",
  progressEvents.length === 50,
  { progressCount: progressEvents.length }
);

// (3) Assert a client joining afterwards gets the full stroke from the live mirror
const clientC = io(API, { transports: ["websocket"], auth: { userId: "late-c" } });
await new Promise((r) => clientC.on("connect", r));

const state = await new Promise((res) => {
  clientC.once("board:state", res);
  clientC.emit("join-board", { boardId: board, userName: "late-c" });
});

const mirroredStroke = state?.elements?.find((e) => e.id === strokeId);
const totalPoints = mirroredStroke?.points?.length ?? 0;

check(
  "Late-joining client gets the full stroke from live mirror",
  mirroredStroke !== undefined && totalPoints === 51,
  { found: Boolean(mirroredStroke), totalPoints }
);

clientA.close();
clientB.close();
clientC.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
