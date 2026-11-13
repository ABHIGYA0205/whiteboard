import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sketchInkColor } from "../client/lib/sketchInk";
import { pickSketchElements } from "../client/lib/sketchSelection";
import type { WhiteboardElement } from "../shared/types";

describe("Step 2 - Client sketch ink and selection", () => {
  test("sketchInkColor: turns light colors to dark #111111 and keeps dark colors unchanged", () => {
    // Light colors -> #111111
    assert.equal(sketchInkColor("#ececf1"), "#111111");
    assert.equal(sketchInkColor("#ffffff"), "#111111");
    assert.equal(sketchInkColor("#fff"), "#111111");
    assert.equal(sketchInkColor("white"), "#111111");
    assert.equal(sketchInkColor("#ffec99"), "#111111");

    // Dark/saturated colors -> unchanged
    assert.equal(sketchInkColor("#e03131"), "#e03131");
    assert.equal(sketchInkColor("#1e293b"), "#1e293b");

    // Garbage / unparseable -> #111111
    assert.equal(sketchInkColor("garbage"), "#111111");
    assert.equal(sketchInkColor(""), "#111111");
    assert.equal(sketchInkColor("#xyz"), "#111111");
  });

  test("pickSketchElements: selection wins; no selection clusters recent strokes; excludes images/text/stickies; empty board returns []", () => {
    // 1. Empty board returns []
    assert.deepEqual(pickSketchElements([]), []);

    // 2. Selection wins even if shapes are far or non-drawing
    const el1: WhiteboardElement = {
      id: "el1",
      type: "pencil",
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      strokeColor: "#000",
      strokeWidth: 2,
      points: [{ x: 100, y: 100 }, { x: 150, y: 150 }]
    };
    const elText: WhiteboardElement = {
      id: "el-text",
      type: "text",
      x: 500,
      y: 500,
      width: 100,
      height: 30,
      strokeColor: "#000",
      strokeWidth: 1,
      text: "Selected text",
      points: []
    };

    const selectionResult = pickSketchElements([el1, elText], ["el-text"]);
    assert.equal(selectionResult.length, 1);
    assert.equal(selectionResult[0].id, "el-text", "Explicit user selection wins");

    // 3. No selection: stick figure plus shapes 700 px away returns only figure's strokes
    const figureStroke1: WhiteboardElement = {
      id: "fig-head",
      type: "circle",
      x: 100,
      y: 100,
      width: 40,
      height: 40,
      strokeColor: "#000",
      strokeWidth: 2,
      points: []
    };
    const figureStroke2: WhiteboardElement = {
      id: "fig-body",
      type: "pencil",
      x: 120,
      y: 140,
      width: 10,
      height: 80,
      strokeColor: "#000",
      strokeWidth: 2,
      points: [{ x: 120, y: 140 }, { x: 120, y: 220 }]
    };
    const distantShape: WhiteboardElement = {
      id: "distant-rect",
      type: "rectangle",
      x: 850, // 700+ px away
      y: 100,
      width: 60,
      height: 60,
      strokeColor: "#000",
      strokeWidth: 2,
      points: []
    };
    const nonDrawingSticky: WhiteboardElement = {
      id: "near-sticky",
      type: "sticky",
      x: 150, // near the figure
      y: 120,
      width: 80,
      height: 80,
      strokeColor: "#000",
      strokeWidth: 1,
      text: "hello note",
      points: []
    };
    const nonDrawingImage: WhiteboardElement = {
      id: "near-image",
      type: "image",
      x: 130, // near the figure
      y: 110,
      width: 100,
      height: 100,
      strokeColor: "#000",
      strokeWidth: 1,
      imageUrl: "https://example.com/test.png",
      points: []
    };

    const board = [distantShape, figureStroke1, nonDrawingSticky, nonDrawingImage, figureStroke2];
    const clusterResult = pickSketchElements(board, []);

    // Most recent drawing element is figureStroke2 (index 4).
    // figureStroke1 is nearby (< 400px away) -> included.
    // distantShape is 700+ px away -> excluded.
    // sticky and image elements are non-drawing types -> excluded.
    const clusterIds = clusterResult.map((el) => el.id).sort();
    assert.deepEqual(clusterIds, ["fig-body", "fig-head"].sort(), "Only stick figure strokes are returned");
  });
});
