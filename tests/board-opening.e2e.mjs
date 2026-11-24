import assert from "node:assert/strict";
import { chromium } from "playwright";

const web = process.env.BASE_URL || "http://127.0.0.1:3000";
const api = process.env.API_URL || "http://127.0.0.1:4001";
const browser = await chromium.launch();
let createdBoard;

function gate() {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  return { pending, release };
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(() => sessionStorage.setItem("whiteboard_user_name", "Opening test"));
  const create = gate();
  const open = gate();
  let creations = 0;
  await page.route(api + "/board", async (route) => {
    if (route.request().method() === "POST") {
      creations++;
      await create.pending;
    }
    await route.continue();
  });
  await page.route(api + "/board/*", async (route) => {
    if (route.request().method() === "GET") await open.pending;
    await route.continue();
  });

  await page.goto(web);
  const createButton = page.getByRole("button", { name: "Create New Board" });
  const opening = page.getByRole("status").getByRole("heading", { name: "Opening your board" });
  await createButton.click();
  await opening.waitFor();
  assert.equal(await page.locator("#hero-create-board-btn").isDisabled(), true);
  if (process.env.LOADER_SCREENSHOT) await page.screenshot({ path: process.env.LOADER_SCREENSHOT });
  create.release();
  await page.waitForURL("**/board/*");
  await opening.waitFor();
  assert.equal(await page.locator(".board-canvas").count(), 0);
  assert.equal(creations, 1);
  open.release();
  await page.locator(".board-canvas").waitFor();
  await opening.waitFor({ state: "hidden" });
  console.log("PASS loading screen covers both board creation and the initial canvas load");

  const boardUrl = page.url();
  const boardId = new URL(boardUrl).pathname.split("/").at(-1);
  createdBoard = {
    id: boardId,
    token: await page.evaluate((id) => sessionStorage.getItem(`canvasflow:token:${id}`), boardId)
  };
  let fail = true;
  await page.unrouteAll();
  await page.route(api + "/board/*", async (route) => {
    if (route.request().method() === "GET" && fail) {
      fail = false;
      await route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
    } else {
      await route.continue();
    }
  });
  await page.goto(boardUrl);
  await page.getByRole("alert").getByText("Could not load the board.").waitFor();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator(".board-canvas").waitFor();
  console.log("PASS board-load errors offer a working retry");

  const mobile = await browser.newPage({ viewport: { width: 360, height: 740 }, reducedMotion: "reduce" });
  const failCreation = gate();
  await mobile.route(api + "/board", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await failCreation.pending;
    await route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
  });
  await mobile.goto(web);
  const mobileButton = mobile.getByRole("button", { name: "Create New Board" });
  await mobileButton.click();
  const mobileStatus = mobile.getByRole("status").filter({ hasText: "Opening your board" });
  await mobileStatus.waitFor();
  assert.equal(await mobileStatus.evaluate((status) =>
    getComputedStyle(status.lastElementChild, "::after").animationName), "none");
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  failCreation.release();
  await mobile.getByRole("alert").getByText("Could not create a board.", { exact: false }).waitFor();
  assert.equal(await mobileButton.isEnabled(), true);
  assert.equal(await mobileButton.evaluate((button) => document.activeElement === button), true);
  console.log("PASS mobile reduced-motion loading and creation-error recovery");
} finally {
  await browser.close();
  if (createdBoard?.token) {
    const response = await fetch(`${api}/board/${createdBoard.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${createdBoard.token}` }
    });
    assert.equal(response.status, 200, "Test board cleanup");
  }
}
