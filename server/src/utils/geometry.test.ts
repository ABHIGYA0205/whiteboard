import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { WhiteboardElement, Point } from "@shared/types";

function getNormalizedBounds(element: WhiteboardElement) {
  const x = element.width >= 0 ? element.x : element.x + element.width;
  const y = element.height >= 0 ? element.y : element.y + element.height;
  const width = Math.abs(element.width);
  const height = Math.abs(element.height);
  return { x, y, width, height };
}

function hitTest(point: Point, element: WhiteboardElement): boolean {
  const bounds = getNormalizedBounds(element);
  if (element.type === "rectangle" || element.type === "circle" || element.type === "text" || element.type === "image") {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }
  return false;
}

function translate(element: WhiteboardElement, deltaX: number, deltaY: number): WhiteboardElement {
  return {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    points: element.points.map((p) => ({ x: p.x + deltaX, y: p.y + deltaY }))
  };
}

describe("Geometry helpers", () => {
  test("getNormalizedBounds handles negative dimensions correctly", () => {
    const el: WhiteboardElement = {
      id: "1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: -50,
      height: -80,
      strokeColor: "#fff",
      strokeWidth: 2,
      points: []
    };
    const bounds = getNormalizedBounds(el);
    assert.equal(bounds.x, 50);
    assert.equal(bounds.y, 20);
    assert.equal(bounds.width, 50);
    assert.equal(bounds.height, 80);
  });

  test("hitTest correctly detects points inside and outside bounds", () => {
    const rect: WhiteboardElement = {
      id: "rect",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      strokeColor: "#fff",
      strokeWidth: 2,
      points: []
    };
    assert.equal(hitTest({ x: 75, y: 75 }, rect), true);
    assert.equal(hitTest({ x: 50, y: 50 }, rect), true);
    assert.equal(hitTest({ x: 150, y: 150 }, rect), true);
    assert.equal(hitTest({ x: 49, y: 50 }, rect), false);
    assert.equal(hitTest({ x: 151, y: 100 }, rect), false);
  });

  test("translate shifts element origin and pencil points", () => {
    const pencil: WhiteboardElement = {
      id: "p1",
      type: "pencil",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      strokeColor: "#fff",
      strokeWidth: 2,
      points: [{ x: 10, y: 10 }, { x: 30, y: 30 }]
    };
    const translated = translate(pencil, 15, -5);
    assert.equal(translated.x, 25);
    assert.equal(translated.y, 5);
    assert.deepEqual(translated.points, [{ x: 25, y: 5 }, { x: 45, y: 25 }]);
  });
});
