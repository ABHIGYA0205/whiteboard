import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { autoCleanElements } from "./ai.service";
import type { WhiteboardElement } from "@shared/types";

describe("autoCleanElements", () => {
  test("preserves non-pencil elements", () => {
    const rect: WhiteboardElement = {
      id: "rect-1",
      type: "rectangle",
      x: 10,
      y: 10,
      width: 100,
      height: 50,
      strokeColor: "#ffffff",
      strokeWidth: 2,
      points: []
    };
    const cleaned = autoCleanElements([rect]);
    assert.deepEqual(cleaned, [rect]);
  });

  test("preserves pencil strokes with fewer than 6 points", () => {
    const shortPencil: WhiteboardElement = {
      id: "pencil-1",
      type: "pencil",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: "#ffffff",
      strokeWidth: 2,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 }
      ]
    };
    const cleaned = autoCleanElements([shortPencil]);
    assert.equal(cleaned[0].type, "pencil");
    assert.equal(cleaned[0].points.length, 3);
  });

  test("cleans straight pencil stroke into line", () => {
    // Generate 10 collinear points from (0,0) to (100,0) with tiny jitter
    const points = Array.from({ length: 11 }, (_, i) => ({
      x: i * 10,
      y: (i % 2 === 0 ? 0.2 : -0.2) // very slight jitter
    }));

    const pencilLine: WhiteboardElement = {
      id: "pencil-line",
      type: "pencil",
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      strokeColor: "#ff0000",
      strokeWidth: 2,
      points
    };

    const cleaned = autoCleanElements([pencilLine]);
    assert.equal(cleaned[0].type, "line");
    assert.equal(cleaned[0].x, 0);
    assert.equal(cleaned[0].points.length, 0);
  });

  test("cleans box-shaped closed strokes into rectangle", () => {
    // Points tracing a rectangle around (0,0) to (100, 100)
    const points: Array<{ x: number; y: number }> = [];
    // Top edge
    for (let x = 0; x <= 100; x += 10) points.push({ x, y: 0 });
    // Right edge
    for (let y = 10; y <= 100; y += 10) points.push({ x: 100, y });
    // Bottom edge
    for (let x = 90; x >= 0; x -= 10) points.push({ x, y: 100 });
    // Left edge back to origin
    for (let y = 90; y >= 0; y -= 10) points.push({ x: 0, y });

    const pencilBox: WhiteboardElement = {
      id: "pencil-box",
      type: "pencil",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      strokeColor: "#00ff00",
      strokeWidth: 2,
      points
    };

    const cleaned = autoCleanElements([pencilBox]);
    assert.equal(cleaned[0].type, "rectangle");
    assert.equal(cleaned[0].width, 100);
    assert.equal(cleaned[0].height, 100);
    assert.equal(cleaned[0].points.length, 0);
  });
});
