import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createBoard, getBoard, updateBoard, deleteBoard } from "./board.service";
import type { WhiteboardElement } from "@shared/types";

describe("Board Service Round-Trip Durability (P0-1 tripwire)", () => {
  test("persists every element type and every styling field without dropping data", async () => {
    const board = await createBoard();
    assert.ok(board.id, "Board must have an id");

    const allTypeElements: WhiteboardElement[] = [
      {
        id: "rect-1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 140,
        strokeColor: "#e03131",
        strokeWidth: 4,
        strokeStyle: "dashed",
        fillColor: "#a5d8ff",
        fillStyle: "semi",
        roughness: 0,
        roundness: false,
        opacity: 0.85,
        isLocked: false,
        points: []
      },
      {
        id: "ellipse-1",
        type: "ellipse",
        x: 350,
        y: 100,
        width: 150,
        height: 150,
        strokeColor: "#2f9e44",
        strokeWidth: 2,
        strokeStyle: "dotted",
        fillColor: "#d3f9d8",
        fillStyle: "solid",
        roughness: 1,
        roundness: true,
        opacity: 0.9,
        points: []
      },
      {
        id: "diamond-1",
        type: "diamond",
        x: 550,
        y: 100,
        width: 120,
        height: 120,
        strokeColor: "#1971c2",
        strokeWidth: 3,
        strokeStyle: "solid",
        fillColor: "#d0ebff",
        fillStyle: "transparent",
        roughness: 2,
        roundness: false,
        opacity: 1,
        points: []
      },
      {
        id: "circle-1",
        type: "circle",
        x: 700,
        y: 100,
        width: 100,
        height: 100,
        strokeColor: "#f59e0b",
        strokeWidth: 2,
        strokeStyle: "solid",
        fillColor: "#fef3c7",
        fillStyle: "solid",
        roughness: 0,
        roundness: true,
        opacity: 1,
        points: []
      },
      {
        id: "line-1",
        type: "line",
        x: 100,
        y: 300,
        width: 150,
        height: 0,
        strokeColor: "#ffffff",
        strokeWidth: 2,
        strokeStyle: "dashed",
        opacity: 1,
        points: []
      },
      {
        id: "arrow-1",
        type: "arrow",
        x: 300,
        y: 300,
        width: 150,
        height: 50,
        strokeColor: "#f43f5e",
        strokeWidth: 3,
        strokeStyle: "solid",
        opacity: 1,
        points: []
      },
      {
        id: "pencil-1",
        type: "pencil",
        x: 500,
        y: 300,
        width: 80,
        height: 80,
        strokeColor: "#8b5cf6",
        strokeWidth: 3,
        strokeStyle: "solid",
        opacity: 0.95,
        points: [
          { x: 500, y: 300 },
          { x: 520, y: 320 },
          { x: 550, y: 340 }
        ]
      },
      {
        id: "text-1",
        type: "text",
        x: 100,
        y: 450,
        width: 250,
        height: 80,
        strokeColor: "#ffffff",
        strokeWidth: 1,
        text: "Multiline\narchitecture label",
        fontSize: 28,
        opacity: 1,
        points: []
      },
      {
        id: "sticky-1",
        type: "sticky",
        x: 400,
        y: 450,
        width: 200,
        height: 200,
        strokeColor: "rgba(0,0,0,0.1)",
        strokeWidth: 1,
        fillColor: "#fef08a",
        text: "Important note with long multiline content",
        fontSize: 18,
        opacity: 1,
        points: []
      },
      {
        id: "image-1",
        type: "image",
        x: 650,
        y: 450,
        width: 320,
        height: 240,
        strokeColor: "#ffffff",
        strokeWidth: 1,
        imageUrl: "/uploads/mock-image-12345.png",
        opacity: 1,
        points: []
      }
    ];

    // Save all elements
    const updated = await updateBoard(board.id, allTypeElements);
    assert.equal(updated.elements.length, allTypeElements.length);

    // Retrieve saved board
    const retrieved = await getBoard(board.id);
    assert.ok(retrieved, "Board must be retrieved successfully");
    assert.equal(retrieved.elements.length, allTypeElements.length);

    // Verify EVERY field of EVERY element is preserved
    for (let i = 0; i < allTypeElements.length; i++) {
      const expected = allTypeElements[i];
      const actual: WhiteboardElement | undefined = retrieved.elements.find(
        (el: WhiteboardElement) => el.id === expected.id
      );
      assert.ok(actual, `Element ${expected.id} must exist in retrieved board`);

      assert.equal(actual.type, expected.type);
      assert.equal(actual.x, expected.x);
      assert.equal(actual.y, expected.y);
      assert.equal(actual.width, expected.width);
      assert.equal(actual.height, expected.height);
      assert.equal(actual.strokeColor, expected.strokeColor);
      assert.equal(actual.strokeWidth, expected.strokeWidth);

      if (expected.strokeStyle) assert.equal(actual.strokeStyle, expected.strokeStyle);
      if (expected.fillColor) assert.equal(actual.fillColor, expected.fillColor);
      if (expected.fillStyle) assert.equal(actual.fillStyle, expected.fillStyle);
      if (expected.roughness !== undefined) assert.equal(actual.roughness, expected.roughness);
      if (expected.roundness !== undefined) assert.equal(actual.roundness, expected.roundness);
      if (expected.text !== undefined) assert.equal(actual.text, expected.text);
      if (expected.fontSize !== undefined) assert.equal(actual.fontSize, expected.fontSize);
      if (expected.imageUrl !== undefined) assert.equal(actual.imageUrl, expected.imageUrl);
      if (expected.opacity !== undefined) assert.equal(actual.opacity, expected.opacity);
      if (expected.isLocked !== undefined) assert.equal(actual.isLocked, expected.isLocked);
      assert.equal(actual.points.length, expected.points.length);
    }
  });

  test("returns null for non-existent board id (404 guard)", async () => {
    const nonExistent = await getBoard("nonexistent-test-id-999");
    assert.equal(nonExistent, null, "Non-existent board must return null so controller responds with 404");
  });

  test("deletes board so subsequent lookups return null", async () => {
    const board = await createBoard();
    const deleted = await deleteBoard(board.id);
    assert.equal(deleted, true);

    const lookup = await getBoard(board.id);
    assert.equal(lookup, null);
  });
});
