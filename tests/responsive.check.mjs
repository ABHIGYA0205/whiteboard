import { chromium } from "playwright";

const WIDTHS = [320, 390, 480, 768, 820, 1024, 1280, 1440];
const HEIGHT = 844;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function boxesIntersect(a, b) {
  if (!a || !b) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function runChecks() {
  console.log(`Starting responsive checks against ${BASE_URL}...\n`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let allPassed = true;

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: HEIGHT },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
    });

    await context.addInitScript(() => {
      window.localStorage.setItem("whiteboard_user_name", "Tester");
      window.localStorage.setItem("whiteboard_user_id", "test-user-id");
    });

    const page = await context.newPage();
    const boardId = `test-resp-${width}-${Date.now()}`;
    await page.goto(`${BASE_URL}/board/${boardId}`, { waitUntil: "networkidle" });

    // Wait for canvas shell and toolbar to mount
    await page.waitForSelector(".top-toolbar", { timeout: 10000 });

    const rowResult = {
      width,
      noHScroll: false,
      noTopBarOverlap: false,
      toolsInsideViewport: false,
      propertiesNoIntersect: false,
      toolSelectable: false
    };

    try {
      // 1. No horizontal scroll
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      rowResult.noHScroll = scrollWidth <= innerWidth + 1;

      // 2. No bounding-box overlap between .top-left-nav, .top-toolbar, and .top-presence-bar
      const leftNavBox = await page.locator(".top-left-nav").boundingBox();
      const toolbarBox = await page.locator(".top-toolbar").boundingBox();
      const presenceBox = await page.locator(".top-presence-bar").boundingBox();

      const navToolbarOverlap = boxesIntersect(leftNavBox, toolbarBox);
      const toolbarPresenceOverlap = boxesIntersect(toolbarBox, presenceBox);
      const navPresenceOverlap = boxesIntersect(leftNavBox, presenceBox);

      rowResult.noTopBarOverlap = !navToolbarOverlap && !toolbarPresenceOverlap && !navPresenceOverlap;

      // 3. Every tool in primary rail is fully inside viewport
      // Check visible buttons inside .top-toolbar
      const visibleButtons = await page.$$eval(".top-toolbar button:visible", (buttons, vpWidth) => {
        return buttons.map((b) => {
          const rect = b.getBoundingClientRect();
          return {
            ariaLabel: b.getAttribute("aria-label"),
            x: rect.x,
            width: rect.width,
            right: rect.right,
            isInside: rect.left >= 0 && rect.right <= vpWidth + 1
          };
        });
      }, width);

      const allButtonsInside = visibleButtons.length > 0 && visibleButtons.every((b) => b.isInside);
      rowResult.toolsInsideViewport = allButtonsInside;

      // If mobile, check that More button opens popover and remaining tools are reachable
      if (width <= 1024) {
        const moreBtn = page.locator('.tool-more-btn:visible');
        if (await moreBtn.count() > 0) {
          await moreBtn.click();
          await page.waitForSelector('.more-tools-popover', { state: 'visible', timeout: 3000 });
          const popoverBox = await page.locator('.more-tools-popover').boundingBox();
          const popoverInside = popoverBox.x >= 0 && popoverBox.x + popoverBox.width <= width + 1;
          if (!popoverInside) {
            rowResult.toolsInsideViewport = false;
          }
          // Close more menu
          await moreBtn.click();
        }
      }

      // 4. Properties panel test
      // Ensure properties panel is open
      const propToggleBtn = page.locator('button[aria-label="Toggle stroke and fill properties"]:visible');
      let propPanel = page.locator('.excalidraw-properties-panel');
      if (await propPanel.count() === 0 || !(await propPanel.isVisible())) {
        await propToggleBtn.click();
        await page.waitForSelector('.excalidraw-properties-panel', { state: 'visible', timeout: 3000 });
      }

      const panelBox = await page.locator('.excalidraw-properties-panel').boundingBox();
      const currentToolbarBox = await page.locator('.top-toolbar').boundingBox();
      const panelToolbarIntersect = boxesIntersect(panelBox, currentToolbarBox);

      // Verify last control is reachable inside panel's scroll area
      const isLastControlReachable = await page.evaluate(() => {
        const panel = document.querySelector('.excalidraw-properties-panel');
        if (!panel) return false;
        panel.scrollTop = panel.scrollHeight;
        // Check if last element in panel is visible in viewport/scroll area
        const lastChild = panel.lastElementChild;
        if (!lastChild) return false;
        const rect = lastChild.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        return rect.bottom <= panelRect.bottom + 10;
      });

      rowResult.propertiesNoIntersect = !panelToolbarIntersect && isLastControlReachable;

      // 5. Select a tool with one tap and ensure it gets active class
      const pencilBtn = page.locator('button[aria-label*="Draw tool"]:visible');
      await pencilBtn.click();
      const isPencilActive = await pencilBtn.evaluate((el) => el.classList.contains('active'));

      // Test swatch single-tap without hover requirement
      const swatchBtn = page.locator('.color-swatch-btn:visible').first();
      let swatchClickable = true;
      if (await swatchBtn.count() > 0) {
        try {
          await swatchBtn.click({ timeout: 2000 });
        } catch {
          swatchClickable = false;
        }
      }

      // On phone (<= 480), verify min 44px tap target height
      let tapTargetOk = true;
      if (width <= 480) {
        const box = await pencilBtn.boundingBox();
        if (!box || box.height < 44) {
          tapTargetOk = false;
        }
      }

      rowResult.toolSelectable = isPencilActive && swatchClickable && tapTargetOk;

    } catch (err) {
      console.error(`Error checking width ${width}:`, err.message);
    }

    const rowPassed =
      rowResult.noHScroll &&
      rowResult.noTopBarOverlap &&
      rowResult.toolsInsideViewport &&
      rowResult.propertiesNoIntersect &&
      rowResult.toolSelectable;

    if (!rowPassed) allPassed = false;
    results.push({ ...rowResult, rowPassed });
    await context.close();
  }

  await browser.close();

  // Print results table
  console.log("------------------------------------------------------------------------------------------------------");
  console.log("| Width  | No H-Scroll | No TopBar Overlap | Rail In Viewport | Prop Sheet OK | Tap Select | Status |");
  console.log("------------------------------------------------------------------------------------------------------");
  for (const r of results) {
    const pad = (val, len) => String(val).padEnd(len);
    console.log(
      `| ${pad(r.width + "px", 6)} | ${pad(r.noHScroll ? "PASS" : "FAIL", 11)} | ${pad(r.noTopBarOverlap ? "PASS" : "FAIL", 17)} | ${pad(r.toolsInsideViewport ? "PASS" : "FAIL", 16)} | ${pad(r.propertiesNoIntersect ? "PASS" : "FAIL", 13)} | ${pad(r.toolSelectable ? "PASS" : "FAIL", 10)} | ${pad(r.rowPassed ? "PASS" : "FAIL", 6)} |`
    );
  }
  console.log("------------------------------------------------------------------------------------------------------\n");

  if (!allPassed) {
    console.error("❌ Some responsive checks failed.");
    process.exit(1);
  } else {
    console.log("✅ All responsive checks passed across all breakpoints (320px to 1440px)!");
    process.exit(0);
  }
}

runChecks();

