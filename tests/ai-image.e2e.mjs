import assert from "node:assert/strict";
import { chromium } from "playwright";
import sharp from "sharp";

const web = process.env.BASE_URL || "http://localhost:3000";
const api = process.env.API_URL || "http://localhost:4001";
const live = process.env.LIVE_IMAGE === "1";
const browser = await chromium.launch();
const initial = await fetch(api + "/board", { method: "POST" });
assert.equal(initial.status, 201);
const board = await initial.json();
const headers = { Authorization: "Bearer " + board.ownerToken };
const prompt = "A single purple paper kite with a striped tail on a white background";

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 740 }, hasTouch: true });
  const errors = [];
  let submitted = false;
  let sketchRejected = false;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem("whiteboard_user_name", "Image QA"));

  if (!live) {
    const fixture = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#6459d1" } }).png().toBuffer();
    await page.route(api + "/ai/capabilities", (route) => route.fulfill({
      json: {
        text: true, textReason: null, sketch: !sketchRejected,
        sketchModel: sketchRejected ? null : "klein", reason: sketchRejected ? "credit" : null
      }
    }));
    await page.route(api + "/ai/generate", (route) => {
      const request = route.request().postDataJSON();
      assert.equal(request.prompt, prompt);
      if (!sketchRejected) {
        assert.match(request.imageBase64, /^data:image\/png;base64,/);
        assert.equal(request.allowTextOnly, false);
        sketchRejected = true;
        return route.fulfill({ status: 409, json: { code: "SKETCH_UNAVAILABLE", error: "The sketch provider is unavailable." } });
      }
      assert.equal(request.imageBase64, undefined);
      submitted = true;
      return route.fulfill({ status: 202, json: { jobId: "test-fallback" } });
    });
    await page.route(api + "/ai/job/test-fallback", (route) => route.fulfill({
      json: {
        status: "completed", progress: 100, imageUrl: "data:image/png;base64," + fixture.toString("base64"),
        provider: "Hugging Face", model: "black-forest-labs/FLUX.1-schnell", sketchGuided: false
      }
    }));
  }

  await page.goto(web + "/board/" + board.id + "?share=" + encodeURIComponent(board.ownerToken));
  await page.locator(".board-canvas").waitFor();
  if (!live) {
    await page.getByRole("button", { name: /Draw tool/ }).filter({ visible: true }).click();
    await page.mouse.move(120, 220);
    await page.mouse.down();
    await page.mouse.move(245, 279, { steps: 15 });
    await page.mouse.up();
  }
  await page.locator(".tool-more-btn:visible").click();
  await page.getByRole("button", { name: "Enhance sketch with AI", exact: true }).click();
  const studio = page.getByRole("dialog", { name: "AI Image Studio" });
  await studio.getByRole("textbox", { name: "Image prompt description" }).fill(prompt);
  if (!live) {
    await studio.getByRole("button", { name: "Generate from sketch" }).click();
    await studio.getByRole("alert").getByText("The sketch provider is unavailable.").waitFor();
  }
  await studio.getByRole("button", { name: "Generate from text" }).click();
  const generated = studio.getByRole("img", { name: prompt });
  await generated.waitFor({ timeout: live ? 100_000 : 10_000 });
  await page.waitForFunction((description) => [...document.images].some((image) =>
    image.alt === description && image.complete && image.naturalWidth > 0), prompt);
  assert.ok(await studio.getByText(live ? /Pollinations · Generated from text/ : /Hugging Face · Generated from text/).isVisible());
  if (process.env.IMAGE_SCREENSHOT) await page.screenshot({ path: process.env.IMAGE_SCREENSHOT });
  await studio.getByRole("button", { name: "Add to Canvas" }).click();
  await studio.waitFor({ state: "hidden" });

  let inserted;
  const deadline = Date.now() + 6500;
  do {
    const result = await (await fetch(api + "/board/" + board.id, { headers })).json();
    inserted = result.elements.find(({ type }) => type === "image");
    if (!inserted) await new Promise((resolve) => setTimeout(resolve, 180));
  } while (!inserted && Date.now() < deadline);

  assert.ok(inserted, "Generated image autosaves on the board");
  const imageResponse = await fetch(new URL(inserted.imageUrl, api));
  assert.ok(imageResponse.ok && imageResponse.headers.get("content-type")?.startsWith("image/"));
  await page.reload();
  await page.locator(".board-canvas").waitFor();
  if (!live) assert.ok(submitted);
  assert.deepEqual(errors, []);
  console.log("PASS", live ? "live Pollinations image" : "Hugging Face response fixture", "in mobile studio, preview, insertion, image serving and autosave");
} finally {
  await browser.close();
  await fetch(api + "/board/" + board.id, { method: "DELETE", headers });
}
