import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { io } from "socket.io-client";

const web = process.env.BASE_URL || "http://localhost:3000";
const api = process.env.API_URL || "http://localhost:4001";
const engine = process.env.RESPONSIVE_ENGINE === "webkit" ? webkit : chromium;
const widths = [320, 360, 390, 430, 480, 600, 667, 740, 741, 768, 820, 1024, 1025, 1279, 1280, 1440, 1920];
const editorViewports = [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1025, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 }
];
const browser = await engine.launch();
const response = await fetch(api + "/board", { method: "POST" });
assert.equal(response.status, 201);
const board = await response.json();
const peers = [];

async function fits(dialog, label) {
  await dialog.waitFor();
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))));
  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      inside: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      overflow: element.scrollWidth - element.clientWidth,
      x: rect.x, y: rect.y, width: rect.width, height: rect.height
    };
  });
  assert.ok(layout.inside && layout.overflow <= 1, label + " " + JSON.stringify(layout));
}

try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ id, token }) => {
    sessionStorage.setItem("whiteboard_user_name", "Responsive QA");
    sessionStorage.setItem("canvasflow:token:" + id, token);
    localStorage.setItem("whiteboard_recent_boards", JSON.stringify([
      { id, title: "Sample board", visitedAt: 2 },
      { id: "another-sample", title: "Another board", visitedAt: 1 }
    ]));
  }, { id: board.id, token: board.ownerToken });
  await page.goto(web);

  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 800 });
    const actions = page.getByRole("button", { name: "Create New Board", exact: true });
    assert.equal(await actions.count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Dashboard width " + width);
    for (const selector of ["header", "#recent", "#templates", "form"]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, selector + " within " + width);
    }
    const recent = await page.getByRole("region", { name: "Recent boards" }).boundingBox();
    const invite = await page.getByRole("region", { name: "Open a board link" }).boundingBox();
    assert.ok(recent && invite && Math.abs(recent.width - invite.width) < 1, "Matched panel widths at " + width);
    if (width > 740) {
      assert.ok(Math.abs(recent.y - invite.y) < 1 && Math.abs(recent.height - invite.height) < 1, "Aligned panel edges at " + width);
      const secondTemplate = await page.locator("#templates button").nth(1).boundingBox();
      const thirdTemplate = await page.locator("#templates button").nth(2).boundingBox();
      assert.ok(Math.abs(recent.x + recent.width - secondTemplate.x - secondTemplate.width) < 1);
      assert.ok(Math.abs(invite.x - thirdTemplate.x) < 1);
    } else {
      assert.ok(invite.y >= recent.y + recent.height && Math.abs(invite.x - recent.x) < 1);
    }
  }

  await page.setViewportSize({ width: 390, height: 568 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "smooth");
  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await page.waitForFunction(() => location.hash === "#templates" && window.scrollY > 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto");

  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim());
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  const lightBackground = await background();
  await page.getByRole("textbox", { name: "Canvas Flow link" }).fill("/board/" + board.id);
  await page.getByRole("button", { name: "Open board", exact: true }).click();
  await page.locator(".board-canvas").waitFor();
  assert.equal(await background(), lightBackground);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  console.log("PASS", engine.name(), "dashboard at", widths.length, "widths, motion preference, one create action, and theme across navigation");

  await Promise.all(Array.from({ length: 4 }, (_, index) => new Promise((resolve, reject) => {
    const peer = io(api, {
      forceNew: true, reconnection: false, transports: ["websocket"], auth: { userId: `responsive-peer-${index}` }
    });
    peers.push(peer);
    peer.once("connect_error", reject);
    peer.once("connect", () => peer.emit("join-board", {
      boardId: board.id, token: board.ownerToken, userName: `Responsive peer ${index}`
    }));
    peer.once("board:state", resolve);
  })));

  for (const viewport of editorViewports) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.locator(".board-canvas").waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".presence-avatar").length >= 5);
    const info = engine.name() + " " + viewport.width + "x" + viewport.height;
    const overlap = await page.evaluate(() => {
      const bars = [...document.querySelectorAll(".top-left-nav, .top-toolbar, .top-presence-bar")]
        .map((bar) => bar.getBoundingClientRect());
      return bars.some((a, index) => bars.slice(index + 1).some((b) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
    });
    assert.equal(overlap, false, info + " toolbar and navigation controls overlap");
    const more = page.locator(".tool-more-btn:visible");

    async function openTool(name) {
      const visibleTarget = page.getByRole("button", { name }).filter({ visible: true });
      if (!(await visibleTarget.count())) await more.click();
      await visibleTarget.click();
    }

    async function checkModal(name) {
      const dialog = page.getByRole("dialog", { name });
      await fits(dialog, info + " " + name);
      await dialog.getByRole("button", { name: /Close/ }).first().click();
      await dialog.waitFor({ state: "hidden" });
    }

    await page.getByRole("button", { name: "Share Board Link" }).click();
    await checkModal("Share Board");
    await page.getByRole("button", { name: "Active collaborators" }).click();
    await checkModal("Active Collaborators");
    await openTool("Open Whiteboard Templates");
    await checkModal("Templates Gallery");
    await openTool(/Generate editable diagram from text prompt|AI Prompt to Diagram/);
    await checkModal("AI Diagram Architect");
    await openTool(/Generate image/);
    await checkModal("AI Image Studio");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Board settings and file menu" });
    await fits(menu, info + " side menu");
    await menu.getByRole("button", { name: "Keyboard Shortcuts & Help" }).click();
    await checkModal("Keyboard Shortcuts");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    console.log("PASS", info, "editor, sharing, collaborators, templates, diagrams, image studio, menu and shortcuts");
  }

  const newUser = await browser.newPage({ viewport: { width: 667, height: 375 } });
  await newUser.goto(web + "/board/" + board.id + "?share=" + encodeURIComponent(board.ownerToken));
  const nameDialog = newUser.getByRole("dialog", { name: "Choose your display name" });
  await fits(nameDialog, "Display name dialog in landscape");
  await nameDialog.getByRole("button", { name: /Guest/ }).click();
  await nameDialog.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
} finally {
  for (const peer of peers) peer.disconnect();
  await browser.close();
  await fetch(api + "/board/" + board.id, { method: "DELETE", headers: { Authorization: "Bearer " + board.ownerToken } });
}
