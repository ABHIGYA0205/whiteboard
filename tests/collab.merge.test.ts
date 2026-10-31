import test from "node:test";
import assert from "node:assert/strict";
import { mergeElementLists } from "@shared/collab";
import type { WhiteboardElement } from "@shared/types";

const el = (id: string, x = 0): WhiteboardElement =>
  ({ id, type: "rectangle", x, y: 0, width: 10, height: 10, strokeColor: "#fff", strokeWidth: 2, points: [] } as WhiteboardElement);

test("a stale remote snapshot must never delete local-only elements", () => {
  // Peer's view does not contain b1 yet -> b1 must survive.
  const result = mergeElementLists({
    local: [el("a1"), el("b1", 50)],
    incoming: [el("a1")]
  });
  assert.deepEqual(result.elements.map((e) => e.id).sort(), ["a1", "b1"]);
});

test("remote upserts still update elements the local user is not touching", () => {
  const result = mergeElementLists({
    local: [el("a1", 0)],
    incoming: [el("a1", 999)],
    now: Date.now()
  });
  assert.equal(result.elements[0].x, 999);
  assert.equal(result.changed, true);
});

test("an in-flight local edit wins over a stale copy of the same element", () => {
  const now = Date.now();
  const result = mergeElementLists({
    local: [el("a1", 500)],
    incoming: [el("a1", 10)],
    localEditTimes: new Map([["a1", now - 500]]),
    now
  });
  assert.equal(result.elements[0].x, 500);
});

test("the element being edited is never yanked away", () => {
  const result = mergeElementLists({
    local: [el("a1", 500)],
    incoming: [el("a1", 10)],
    editingElementId: "a1"
  });
  assert.equal(result.elements[0].x, 500);
});

test("explicit tombstones from a peer do delete elements", () => {
  const result = mergeElementLists({
    local: [el("a1"), el("b1")],
    incoming: [el("a1")],
    deletedIds: ["b1"]
  });
  assert.deepEqual(result.elements.map((e) => e.id), ["a1"]);
  assert.ok(result.tombstones.has("b1"));
});

test("local tombstones are respected and never resurrected", () => {
  const result = mergeElementLists({
    local: [el("a1")],
    incoming: [el("a1"), el("dead")],
    localTombstones: ["dead"]
  });
  assert.deepEqual(result.elements.map((e) => e.id), ["a1"]);
});

test("union is order-stable and idempotent", () => {
  const first = mergeElementLists({ local: [el("a")], incoming: [el("b"), el("c")] });
  const second = mergeElementLists({ local: first.elements, incoming: [el("b"), el("c")] });
  assert.deepEqual(second.elements.map((e) => e.id), ["a", "b", "c"]);
  assert.equal(second.changed, false);
});
