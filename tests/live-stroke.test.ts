import test from "node:test";
import assert from "node:assert/strict";
import { useBoardStore, registerResyncHandler, resetUnknownElementWarnings } from "@/store/boardStore";
import type { WhiteboardElement } from "@shared/types";

const el = (id: string, x = 0): WhiteboardElement =>
  ({
    id,
    type: "pencil",
    x,
    y: 0,
    width: 10,
    height: 10,
    strokeColor: "#fff",
    strokeWidth: 2,
    points: [{ x: 0, y: 0 }]
  } as WhiteboardElement);

const reset = () => {
  useBoardStore.getState().loadBoard([], 0);
  resetUnknownElementWarnings();
  registerResyncHandler(null);
};

test("live-stroke: appendRemotePoints on unknown element returns state and requests resync", () => {
  reset();
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(" "));
  };

  let resyncRequested = 0;
  registerResyncHandler(() => {
    resyncRequested++;
  });

  try {
    // 1. Initial draw-progress for an unknown element
    useBoardStore.getState().appendRemotePoints("unknown-stroke-1", [{ x: 10, y: 10 }], {
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });

    // Elements should remain empty (return state as today)
    assert.equal(useBoardStore.getState().elements.length, 0);

    // Should have triggered resync
    assert.equal(resyncRequested, 1);

    // Should have logged the warning
    assert.equal(warnings.length, 1);
    assert.equal(
      warnings[0],
      "[collab] draw-progress for unknown element unknown-stroke-1; requesting resync"
    );

    // 2. Second draw-progress for the SAME unknown element
    useBoardStore.getState().appendRemotePoints("unknown-stroke-1", [{ x: 20, y: 20 }], {
      x: 0,
      y: 0,
      width: 20,
      height: 20
    });

    // Should NOT warn again for the same elementId
    assert.equal(warnings.length, 1, "Warning must be logged only once per elementId");

    // Resync handler is invoked on each missing point
    assert.equal(resyncRequested, 2);
  } finally {
    console.warn = originalWarn;
    process.env.NODE_ENV = originalEnv;
    reset();
  }
});

test("live-stroke: appendRemotePoints does NOT warn in production environment", () => {
  reset();
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(" "));
  };

  let resyncRequested = 0;
  registerResyncHandler(() => {
    resyncRequested++;
  });

  try {
    useBoardStore.getState().appendRemotePoints("unknown-stroke-prod", [{ x: 10, y: 10 }], {
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });

    // Warning must be suppressed in production
    assert.equal(warnings.length, 0);

    // Resync is still requested
    assert.equal(resyncRequested, 1);
  } finally {
    console.warn = originalWarn;
    process.env.NODE_ENV = originalEnv;
    reset();
  }
});

test("live-stroke: appendRemotePoints on known element appends points without warning or resync", () => {
  reset();
  const knownStroke = el("known-stroke-1");
  useBoardStore.getState().commitElements([knownStroke]);

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(" "));
  };

  let resyncRequested = 0;
  registerResyncHandler(() => {
    resyncRequested++;
  });

  try {
    useBoardStore.getState().appendRemotePoints("known-stroke-1", [{ x: 15, y: 15 }, { x: 20, y: 20 }], {
      x: 0,
      y: 0,
      width: 25,
      height: 25
    });

    assert.equal(warnings.length, 0);
    assert.equal(resyncRequested, 0);

    const updated = useBoardStore.getState().elements.find((e) => e.id === "known-stroke-1");
    assert.ok(updated);
    assert.equal(updated.points.length, 3); // initial 1 + 2 appended
    assert.equal(updated.width, 25);
    assert.equal(updated.height, 25);
  } finally {
    console.warn = originalWarn;
    reset();
  }
});
