import assert from "node:assert/strict";
import { chromium } from "playwright";

const web = process.env.BASE_URL || "http://localhost:3000";
const api = process.env.API_URL || "http://localhost:4001";
const response = await fetch(api + "/board", { method: "POST" });
assert.equal(response.status, 201);
const board = await response.json();
const headers = { Authorization: "Bearer " + board.ownerToken };
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    sessionStorage.setItem("whiteboard_user_name", "Canvas QA");
    const draws = window.canvasQa = { text: [], handles: [] };
    const context = CanvasRenderingContext2D.prototype;
    const onBoard = (ctx) => ctx.canvas.classList.contains("board-canvas");
    const clear = context.clearRect;
    const fillText = context.fillText;
    const roundRect = context.roundRect;
    context.clearRect = function (...args) {
      if (onBoard(this)) {
        draws.text = [];
        draws.handles = [];
      }
      return clear.apply(this, args);
    };
    context.fillText = function (value, x, y, ...args) {
      if (onBoard(this)) {
        const transform = this.getTransform();
        draws.text.push({ value, x: (x * transform.a + transform.e) / devicePixelRatio,
          y: (y * transform.d + transform.f) / devicePixelRatio });
      }
      return fillText.call(this, value, x, y, ...args);
    };
    context.roundRect = function (x, y, width, ...args) {
      if (onBoard(this)) draws.handles.push(width * this.getTransform().a / devicePixelRatio);
      return roundRect.call(this, x, y, width, ...args);
    };
  });
  await page.goto(web + "/board/" + board.id + "?share=" + encodeURIComponent(board.ownerToken));
  const canvas = page.locator(".board-canvas");
  await canvas.waitFor();

  await page.getByRole("button", { name: /^Text tool/ }).filter({ visible: true }).click();
  await canvas.click({ position: { x: 720, y: 420 } });
  const editor = page.getByRole("textbox", { name: "Edit canvas text" });
  await editor.pressSequentially("A clear line");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await editor.inputValue(), "A clear line");
  assert.equal(await page.evaluate(() => window.canvasQa.text.some(({ value }) => value === "A clear line")), false);
  await editor.press("Control+Enter");
  await editor.waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.canvasQa.text.some(({ value }) => value === "A clear line"));

  await canvas.click({ position: { x: 747, y: 434 } });
  await page.waitForFunction(() => window.canvasQa.handles.length === 4);
  assert.deepEqual(await page.evaluate(() => window.canvasQa.handles), [6, 6, 6, 6]);
  const oldZoom = await page.getByRole("button", { name: "Reset zoom" }).innerText();
  await page.getByRole("button", { name: "Zoom in" }).click();
  assert.notEqual(await page.getByRole("button", { name: "Reset zoom" }).innerText(), oldZoom);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const zoomedHandles = await page.evaluate(() => window.canvasQa.handles);
  assert.equal(zoomedHandles.length, 4);
  assert.ok(zoomedHandles.every((size) => Math.abs(size - 6) < 0.01));

  await page.getByRole("button", { name: "Open menu" }).click();
  const fitOption = page.getByRole("dialog", { name: "Board settings and file menu" })
    .getByRole("button", { name: "Fit board to screen" });
  const gap = await fitOption.evaluate((button) =>
    button.querySelector("span").getBoundingClientRect().left - button.querySelector("svg").getBoundingClientRect().right
  );
  assert.ok(Math.abs(gap - 10) < 1);
  await fitOption.click();
  await page.waitForFunction(() => window.canvasQa.text.some(({ value, x }) => value === "A clear line" && x > 460 && x < 860));
  const rendered = await page.evaluate(() => window.canvasQa.text.find(({ value }) => value === "A clear line"));
  assert.ok(rendered.x > 460 && rendered.x < 860);
  assert.ok(rendered.y > 300 && rendered.y < 570);
  await canvas.dblclick({ position: { x: rendered.x + 20, y: rendered.y + 8 } });
  await editor.waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.canvasQa.text.some(({ value }) => value === "A clear line")), false);
  await editor.press("Control+Enter");

  console.log("PASS canvas text appears once while typing and editing, handles stay 6px at zoom, and fit aligns to the board");
} finally {
  await browser.close();
  await fetch(api + "/board/" + board.id, { method: "DELETE", headers });
}
