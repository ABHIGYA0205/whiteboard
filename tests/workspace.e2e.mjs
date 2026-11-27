import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const web = process.env.BASE_URL || "http://localhost:3000";
const api = process.env.API_URL || "http://localhost:4001";
const browser = await chromium.launch();
const boards = new Map();
const errors = [];

async function openWorkspace(context) {
  await context.addInitScript(() => sessionStorage.setItem("whiteboard_user_name", "Workspace QA"));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(web);
  return page;
}

async function recordBoard(page) {
  await page.locator(".board-canvas").waitFor();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const token = await page.evaluate((key) => sessionStorage.getItem("canvasflow:token:" + key), id);
  assert.ok(token);
  boards.set(id, token);
  return { id, headers: { Authorization: "Bearer " + token } };
}

async function downloadFromBoard(page, label) {
  await page.getByRole("button", { name: "Open menu" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: label }).click()
  ]);
  return readFile(await download.path());
}

try {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const owner = await openWorkspace(ownerContext);
  await owner.getByRole("heading", { name: "Recent boards" }).waitFor();
  await owner.getByRole("button", { name: /Kanban board/ }).click();

  const { id, headers } = await recordBoard(owner);
  const title = owner.getByRole("textbox", { name: "Board Title" });
  assert.equal(await title.inputValue(), "Kanban board");
  const seededResponse = await fetch(api + "/board/" + id, { headers });
  assert.equal(seededResponse.headers.get("Cache-Control"), "no-store");
  const seeded = await seededResponse.json();
  assert.ok(seeded.elements.length > 0);
  await owner.reload();
  await owner.locator(".board-canvas").waitFor();
  assert.equal(await title.inputValue(), "Kanban board");
  console.log("PASS template creates a named board whose elements survive reload");

  await owner.getByRole("button", { name: "Share Board Link" }).click();
  const share = owner.getByRole("dialog", { name: "Share Board" });
  await share.getByRole("button", { name: "Copy", exact: true }).first().click();
  await share.getByRole("button", { name: "Copied" }).waitFor();
  const viewerLink = await owner.evaluate(() => navigator.clipboard.readText());
  assert.equal(viewerLink, await share.getByRole("textbox", { name: "Viewer invite link" }).inputValue());
  const editorLink = await share.getByRole("textbox", { name: "Editor invite link" }).inputValue();
  await share.getByRole("button", { name: "Close modal" }).click();

  const viewerContext = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const viewer = await openWorkspace(viewerContext);
  const invite = viewer.getByRole("region", { name: "Open a board link" });
  const inviteInput = invite.getByRole("textbox", { name: "Canvas Flow link" });
  await inviteInput.fill("https://unconfigured.invalid/board/elsewhere");
  await invite.getByRole("button", { name: "Open board" }).click();
  await invite.getByRole("alert").waitFor();
  const pastedLink = new URL(viewerLink);
  if (pastedLink.hostname === "localhost") pastedLink.hostname = "127.0.0.1";
  await inviteInput.fill(pastedLink.href);
  await invite.getByRole("button", { name: "Open board" }).click();
  await viewer.locator(".board-canvas").waitFor();
  assert.equal(new URL(viewer.url()).searchParams.has("share"), false);
  await viewer.getByRole("button", { name: "Open menu" }).click();
  const viewerTitle = viewer.getByRole("textbox", { name: "Board Title" });
  assert.equal(await viewerTitle.getAttribute("readonly"), "");
  await viewer.getByText("You have view-only access to this board.").waitFor();

  await title.fill("Launch roadmap");
  const rename = owner.waitForResponse((response) => response.request().method() === "PATCH");
  await title.press("Enter");
  assert.equal((await rename).status(), 200);
  await viewer.waitForFunction(() => Array.from(document.querySelectorAll(".board-title-input")).some((input) => input.value === "Launch roadmap"));
  await title.fill("Discarded title");
  await title.press("Escape");
  assert.equal(await title.inputValue(), "Launch roadmap");
  console.log("PASS invite clipboard and links work, owners can rename, and viewers see updates live");

  for (const role of [viewerLink, editorLink]) {
    const bearer = new URL(role).searchParams.get("share");
    for (const method of ["PATCH", "DELETE"]) {
      const response = await fetch(api + "/board/" + id, {
        method,
        headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
        body: method === "PATCH" ? JSON.stringify({ title: "Changed" }) : undefined
      });
      assert.equal(response.status, 403);
    }
  }
  assert.equal((await (await fetch(api + "/board/" + id, { headers })).json()).title, "Launch roadmap");

  const snapshot = await downloadFromBoard(owner, "Save board to JSON file");
  assert.equal(JSON.parse(snapshot).length, seeded.elements.length);
  const svg = await downloadFromBoard(owner, "Export canvas to vector SVG");
  assert.match(svg.toString(), /<svg .*viewBox=/);
  const png = await downloadFromBoard(owner, "Export canvas to PNG image");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  console.log("PASS JSON, SVG and PNG downloads contain board data");

  await owner.goto(web);
  await owner.getByRole("link", { name: "Launch roadmap" }).click();
  await owner.locator(".board-canvas").waitFor();
  assert.equal(await title.inputValue(), "Launch roadmap");
  await owner.goto(web);
  await owner.getByRole("button", { name: "Remove Launch roadmap from recent boards" }).click();
  await owner.getByRole("link", { name: "Launch roadmap" }).waitFor({ state: "hidden" });

  const importInput = owner.locator('input[type="file"]');
  await importInput.setInputFiles({
    name: "Broken.json", mimeType: "application/json", buffer: Buffer.from("[{}]")
  });
  await owner.getByRole("alert").getByText("The board file contains invalid or duplicate elements.").waitFor();
  await importInput.setInputFiles({ name: "Restored board.json", mimeType: "application/json", buffer: snapshot });
  const restored = await recordBoard(owner);
  assert.notEqual(restored.id, id);
  const restoredData = await (await fetch(api + "/board/" + restored.id, { headers: restored.headers })).json();
  assert.equal(restoredData.title, "Restored board");
  assert.deepEqual(restoredData.elements, seeded.elements);
  console.log("PASS recents reopen saved boards, and JSON restores into a separate board");

  const loadRestored = async () => (await fetch(api + "/board/" + restored.id, { headers: restored.headers })).json();
  const waitForSave = async (predicate) => {
    const deadline = Date.now() + 6000;
    do {
      const board = await loadRestored();
      if (predicate(board)) return board;
      await new Promise((resolve) => setTimeout(resolve, 150));
    } while (Date.now() < deadline);
    assert.fail("Timed out waiting for the board to save");
  };

  const imageInput = owner.locator('input[accept="image/*"]');
  await imageInput.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("invalid image") });
  await owner.getByRole("alert").getByText("Could not open this image.", { exact: false }).waitFor();
  await owner.getByRole("button", { name: "Dismiss image error" }).click();
  const imageBytes = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#4f46e5" } }).png().toBuffer();
  await imageInput.setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: imageBytes });
  const withImage = await waitForSave((board) => board.elements.some(({ type }) => type === "image"));
  const image = withImage.elements.find(({ type }) => type === "image");
  assert.equal(image.width / image.height, 2);
  const servedImage = await fetch(new URL(image.imageUrl, api));
  assert.equal(servedImage.headers.get("content-type"), "image/png");
  assert.match(servedImage.headers.get("content-security-policy"), /sandbox/);

  await owner.getByRole("button", { name: "Generate editable diagram from text prompt" }).click();
  await owner.getByRole("textbox", { name: "Process flow description" }).fill("Draft proposal -> Team review -> Publish");
  await owner.getByRole("button", { name: "Generate Editable Diagram", exact: true }).click();
  const withDiagram = await waitForSave((board) => board.elements.length > withImage.elements.length);
  assert.ok(withDiagram.elements.some(({ type, text }) => type === "text" && /team review/i.test(text ?? "")));
  console.log("PASS valid images keep their proportions, invalid files are rejected, and editable diagrams autosave");

  await viewer.goto(web);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await viewer.setViewportSize({ width, height: 800 });
    assert.ok(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.ok(await viewer.getByRole("button", { name: "Create New Board" }).isVisible());
  }
  assert.deepEqual(errors, []);
  console.log("PASS workspace fits phone, tablet, and desktop without page errors");
} finally {
  await browser.close();
  await Promise.all(Array.from(boards, ([id, token]) => fetch(api + "/board/" + id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token }
  })));
}
