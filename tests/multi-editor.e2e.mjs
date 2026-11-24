// Run against the development frontend (uses the dev-only board store inspection hook)
// and a local API connected to a dedicated MongoDB database.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";

const web = process.env.BASE_URL || "http://127.0.0.1:3000";
const api = process.env.API_URL || "http://127.0.0.1:4001";

async function request(path, { method = "GET", token, body, status = 200 } = {}) {
  const response = await fetch(api + path, {
    method,
    signal: AbortSignal.timeout(5000),
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { "Content-Type": "application/json" })
    },
    body: body && JSON.stringify(body)
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}

async function eventually(read, predicate, message) {
  const deadline = performance.now() + 8000;
  let data;
  while (performance.now() < deadline) {
    data = await read();
    if (predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.fail(`${message}: ${JSON.stringify(data).slice(0, 300)}`);
}

const shape = (id, x = 250) => ({
  id, type: "rectangle", x, y: 260, width: 70, height: 50,
  strokeColor: "#f43f5e", strokeWidth: 2, points: []
});
const create = () => request("/board", { method: "POST", status: 201 });

const ready = await request("/health/ready");
assert.equal(ready.mongo, "connected");
const board = await create();
const path = `/board/${board.id}`;
const token = board.ownerToken;
const shared = await request(path + "/share", { method: "POST", token, body: { role: "editor" } });
const viewer = await request(path + "/share", { method: "POST", token, body: { role: "viewer" } });
const options = (role = token) => ({ token: role, method: "POST" });
const getBoard = () => request(path, { token });
const saveOps = (ops, version, role = token, status = 200) => request(path + "/ops?compact=1", {
  ...options(role), body: { ops, version }, status
});
const update = (element) => ({ op: "update", element });
const remove = (id) => ({ op: "delete", element: { id } });
const browser = await chromium.launch();
const pageErrors = [];

try {
  // Contended writes from separate clients must retain every independent element.
  const saved = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    saveOps([update(shape(`concurrent-${index}`))], undefined, shared.token)
  ));
  assert.equal(new Set(saved.map(({ version }) => version)).size, 12);
  const seeded = await getBoard();
  assert.equal(seeded.elements.length, 12);
  const race = await Promise.all([
    fetch(api + path + "/ops", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version: seeded.version, ops: [update(shape("version-race-a"))] })
    }),
    fetch(api + path + "/ops", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version: seeded.version, ops: [update(shape("version-race-b"))] })
    })
  ]);
  assert.deepEqual(race.map(({ status }) => status).sort(), [200, 409]);
  await saveOps([remove("concurrent-0")]);
  const staleSave = await saveOps([update(shape("concurrent-0", 900))]);
  assert.deepEqual(staleSave.elements, []);
  assert.deepEqual(staleSave.deletedIds, ["concurrent-0"]);
  console.log("PASS  12 parallel saves, version conflicts, and durable deletions");

  async function open(name, accessToken, existingContext) {
    const context = existingContext ?? await browser.newContext({ viewport: { width: 1300, height: 850 } });
    await context.addInitScript((label) => sessionStorage.setItem("whiteboard_user_name", label), name);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(web + path + "?share=" + encodeURIComponent(accessToken));
    await page.locator(".board-canvas").waitFor();
    return { context, page };
  }

  const sessions = await Promise.all([open("Alice", token), open("Bob", shared.token), open("Carol", shared.token)]);
  const [alice, bob, carol] = sessions.map(({ page }) => page);
  const pages = [alice, bob, carol];
  const elements = (page) => page.evaluate(() => window.__boardStore.getState().elements);
  const pencil = async (page) => (await elements(page)).filter(({ type }) => type === "pencil");
  await Promise.all(pages.map((page) => page.waitForFunction(() =>
    window.__boardStore?.getState().presenceUsers.length === 3
  )));

  const frameCounts = [];
  await Promise.all(pages.map(async (page, index) => {
    const session = await page.context().newCDPSession(page);
    await session.send("Network.enable");
    frameCounts[index] = { progress: 0, cursors: 0 };
    session.on("Network.webSocketFrameSent", ({ response }) => {
      if (response.payloadData.startsWith('42["draw-progress",')) frameCounts[index].progress++;
      if (response.payloadData.startsWith('42["cursor-position",')) frameCounts[index].cursors++;
    });
  }));

  const starts = [350, 490, 630];
  await Promise.all(pages.map(async (page, index) => {
    await page.mouse.move(480, starts[index]);
    await page.mouse.down();
  }));
  const started = performance.now();
  // Batch synthetic high-rate pointer moves inside frames. Playwright's
  // mouse.move({steps}) waits a frame between events and cannot test coalescing.
  await Promise.all(pages.map((page, index) => page.evaluate(async (y) => {
    const canvas = document.querySelector(".board-canvas");
    for (let frame = 0; frame < 10; frame++) {
      await new Promise(requestAnimationFrame);
      for (let step = 1; step <= 8; step++) {
        const progress = (frame * 8 + step) / 80;
        canvas.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1,
          clientX: 480 + 290 * progress, clientY: y + 50 * progress
        }));
      }
    }
  }, starts[index])));
  const live = await Promise.all(pages.map((page) => eventually(
    () => pencil(page),
    (strokes) => strokes.length === 3 && strokes.every(({ points }) => points.length > 15),
    "All in-progress strokes must reach each editor"
  )));
  const elapsed = Math.round(performance.now() - started);
  assert.ok(live.every((strokes) => strokes.length === 3));
  assert.ok(frameCounts.every(({ progress }) => progress > 0 && progress < 80), JSON.stringify(frameCounts));
  await Promise.all(pages.map((page) => page.mouse.up()));
  const durable = await eventually(getBoard, (data) =>
    data.elements.filter(({ type }) => type === "pencil").length === 3, "All strokes must survive autosave");
  console.log(`PASS  3 browsers drew simultaneously; all showed 3 live strokes in ${elapsed} ms including pointer input`);
  console.log(`      WebSocket frames during the gestures: ${JSON.stringify(frameCounts)}`);

  // Reloading a browser verifies the join snapshot and persisted drawing data.
  await carol.reload();
  await eventually(() => pencil(carol), (strokes) =>
    strokes.length === 3 && strokes.every(({ id, points }) =>
      points.length === durable.elements.find((element) => element.id === id)?.points.length),
    "Reload must recover all saved stroke points");
  console.log("PASS  reload restored all three completed strokes");

  const [aliceContext] = sessions.map(({ context }) => context);
  await aliceContext.setOffline(true);
  try {
    await alice.mouse.move(530, 715);
    await alice.mouse.down();
    await alice.mouse.move(650, 740, { steps: 12 });
    await alice.mouse.up();
    await eventually(() => pencil(alice), (strokes) => strokes.length === 4, "Offline edit must stay local");
    assert.equal((await pencil(bob)).length, 3);
  } finally {
    await aliceContext.setOffline(false);
  }
  await eventually(() => pencil(bob), (strokes) => strokes.length === 4, "Peer must receive offline edit after reconnect");
  await eventually(getBoard, (data) => data.elements.filter(({ type }) => type === "pencil").length === 4,
    "Offline edit must persist after reconnect");
  console.log("PASS  offline drawing was delivered and saved after reconnect");

  await alice.keyboard.press("Control+z");
  await eventually(() => pencil(bob), (strokes) => strokes.length === 3, "Undo must remove Alice's offline stroke");
  await alice.keyboard.press("Control+Shift+z");
  await eventually(() => pencil(bob), (strokes) => strokes.length === 4, "Redo must restore Alice's stroke");
  assert.deepEqual(pageErrors, []);

  const view = await open("Viewer", viewer.token, aliceContext);
  await view.page.mouse.move(600, 700);
  await view.page.mouse.down();
  await view.page.mouse.move(750, 730, { steps: 15 });
  await view.page.mouse.up();
  assert.equal((await pencil(view.page)).length, 4, "A viewer must not create a local stroke");
  await view.page.mouse.dblclick(280, 280);
  assert.equal(await view.page.locator(".canvas-shell textarea").count(), 0, "A viewer must not open the text editor");
  await view.page.keyboard.press("Control+a");
  await view.page.keyboard.press("Delete");
  await view.page.keyboard.press("x");
  assert.equal((await pencil(view.page)).length, 4, "Viewer keyboard shortcuts must not delete board content");
  await alice.mouse.move(810, 705);
  await alice.mouse.down();
  await alice.mouse.move(930, 730, { steps: 12 });
  await alice.mouse.up();
  await eventually(getBoard, (data) => data.elements.filter(({ type }) => type === "pencil").length === 5,
    "Opening a viewer link in another tab must preserve the owner's write access");
  console.log("PASS  collaborative undo/redo and independent viewer permissions across tabs");
} finally {
  await browser.close();
  await request(path, { method: "DELETE", token });
}
