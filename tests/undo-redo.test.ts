import test from "node:test";
import assert from "node:assert/strict";
import { useBoardStore } from "@/store/boardStore";
import { mergeElementLists } from "@shared/collab";
import type { WhiteboardElement } from "@shared/types";

// ---------------------------------------------------------------------------------------------------
// A model of the rest of the system, with the same rules as the real one:
//  - the server keeps a union of everything it was sent and never forgets a tombstone
//    (server/src/services/board.service.ts: mergeForStorage)
//  - a peer applies what it receives with the shared merge (shared/collab.ts)
// ---------------------------------------------------------------------------------------------------
class FakeServer {
  stored: WhiteboardElement[] = [];
  deleted = new Set<string>();
  receive(elements: WhiteboardElement[], deletedIds: Iterable<string>) {
    for (const id of deletedIds) this.deleted.add(id);
    const incoming = new Set(elements.map((element) => element.id));
    this.stored = [
      ...elements.filter((element) => !this.deleted.has(element.id)),
      ...this.stored.filter((element) => !incoming.has(element.id) && !this.deleted.has(element.id))
    ];
    return { elements: this.stored, deletedIds: Array.from(this.deleted) };
  }
}
class FakePeer {
  elements: WhiteboardElement[] = [];
  tombstones = new Set<string>();
  receive(elements: WhiteboardElement[], deletedIds: Iterable<string>) {
    const merged = mergeElementLists({ local: this.elements, incoming: elements, deletedIds, localTombstones: this.tombstones });
    this.elements = merged.elements;
    this.tombstones = merged.tombstones;
  }
}

const store = () => useBoardStore.getState();
const el = (id: string, extra: Partial<WhiteboardElement> = {}): WhiteboardElement =>
  ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, strokeColor: "#fff", strokeWidth: 2, points: [], ...extra } as WhiteboardElement);
const ids = (list: WhiteboardElement[]) => list.map((element) => element.id);
const texts = (list: WhiteboardElement[]) => list.map((element) => element.text).sort();

let server: FakeServer;
let peer: FakePeer;
function fresh() {
  store().loadBoard([], 0);
  useBoardStore.setState({ tool: "select" });
  server = new FakeServer();
  peer = new FakePeer();
}
/** What the app does after every local action: emit the board, then merge the server's answer. */
function sync() {
  const { elements, deletedElementIds } = store();
  peer.receive(elements, deletedElementIds);
  const answer = server.receive(elements, deletedElementIds);
  store().mergeRemoteElements(answer.elements, answer.deletedIds);
}
/** Lets a remote update win over a recent local edit (the store protects local edits for 600 ms). */
const graceOver = () => useBoardStore.setState({ localEditTimes: new Map() });
const add = (element: WhiteboardElement) => store().commitElements([...store().elements, element]);

test("undo of an add deletes the element for everyone, and it stays deleted", () => {
  fresh();
  add(el("a"));
  add(el("b"));
  sync();
  assert.deepEqual(ids(server.stored).sort(), ["a", "b"]);

  const next = store().undo();
  assert.deepEqual(ids(next as WhiteboardElement[]), ["a"]);
  assert.ok(store().deletedElementIds.has("b"), "the undone element must be tombstoned");
  sync();
  sync(); // a second echo must not bring it back
  assert.deepEqual(ids(store().elements), ["a"]);
  assert.deepEqual(ids(server.stored), ["a"]);
  assert.deepEqual(ids(peer.elements), ["a"]);
});

test("redo of an add brings the element back for everyone under a new id", () => {
  fresh();
  add(el("a"));
  add(el("b", { text: "second" }));
  sync();
  store().undo();
  sync();
  store().redo();
  sync();
  for (const list of [store().elements, server.stored, peer.elements]) {
    assert.equal(list.length, 2);
    assert.deepEqual(texts(list), [undefined, "second"].sort());
    assert.ok(!ids(list).includes("b"), "the old id is dead; the element lives under a new one");
  }
  // undo again removes the re-added element, redo again restores it
  store().undo();
  sync();
  assert.deepEqual(ids(server.stored), ["a"]);
  assert.deepEqual(ids(peer.elements), ["a"]);
  store().redo();
  sync();
  assert.equal(server.stored.length, 2);
  assert.equal(peer.elements.length, 2);
});

test("undo of a delete restores the element for everyone and it survives a reload", () => {
  fresh();
  add(el("a"));
  add(el("b", { text: "keep me", x: 40 }));
  sync();
  store().selectElement("b");
  store().deleteSelected();
  sync();
  assert.deepEqual(ids(server.stored), ["a"]);
  assert.deepEqual(ids(peer.elements), ["a"]);

  store().undo();
  sync();
  sync();
  for (const list of [store().elements, server.stored, peer.elements]) {
    assert.equal(list.length, 2);
    const back = list.find((element) => element.text === "keep me");
    assert.ok(back, "the deleted element is back");
    assert.equal(back?.x, 40);
    assert.notEqual(back?.id, "b");
  }
  assert.ok(server.deleted.has("b"), "the old id stays tombstoned");

  // reload: a fresh client gets the server's state
  store().loadBoard(server.stored, 1);
  assert.equal(store().elements.length, 2);
  assert.ok(store().elements.some((element) => element.text === "keep me"));
});

test("undo never removes or reverts what a peer did in the meantime", () => {
  fresh();
  add(el("mine-1"));
  sync();
  add(el("mine-2"));
  sync();
  // a peer adds a shape and recolours my first one
  store().mergeRemoteElements([el("peer-shape")]);
  graceOver();
  store().mergeRemoteElements([el("mine-1", { strokeColor: "#f00" })]);

  store().undo(); // undoes "add mine-2" only
  assert.deepEqual(ids(store().elements).sort(), ["mine-1", "peer-shape"]);
  assert.ok(!store().deletedElementIds.has("peer-shape"), "a peer's element must never be tombstoned by my undo");
  assert.equal(store().elements.find((element) => element.id === "mine-1")?.strokeColor, "#f00");
});

test("undo of a move puts back only the moved fields and keeps a peer's later recolour", () => {
  fresh();
  add(el("a", { x: 0 }));
  sync();
  // drag: live updates, then one commit (the call pattern of useCanvas.ts)
  const before = store().elements;
  store().setElements([el("a", { x: 20 })]);
  store().setElements([el("a", { x: 50 })]);
  store().commitElements(store().elements, before);
  sync();
  assert.equal(store().history.length, 2);

  graceOver();
  store().mergeRemoteElements([el("a", { x: 50, strokeColor: "#0f0" })]);

  store().undo();
  const a = store().elements[0];
  assert.equal(a.x, 0, "my move is undone");
  assert.equal(a.strokeColor, "#0f0", "the peer's colour stays");
  store().redo();
  assert.equal(store().elements[0].x, 50);
  assert.equal(store().elements[0].strokeColor, "#0f0");
});

test("setElements followed by commitElements with the same array is exactly one undo step", () => {
  fresh();
  add(el("a"));
  const next = [...store().elements, el("sticky", { type: "sticky" } as Partial<WhiteboardElement>)];
  store().setElements(next);
  store().commitElements(next); // the sticky-note call pattern
  assert.equal(store().history.length, 2);
  store().undo();
  assert.deepEqual(ids(store().elements), ["a"]);
  assert.equal(store().history.length, 1);
});

test("a commit that changes nothing creates no undo step", () => {
  fresh();
  add(el("a"));
  store().commitElements(store().elements);
  store().commitElements([...store().elements]);
  store().commitElements(store().elements.map((element) => ({ ...element })));
  assert.equal(store().history.length, 1);
});

test("one eraser stroke is one undo step and undo restores every erased element in its old order", () => {
  fresh();
  add(el("a", { text: "A" }));
  add(el("b", { text: "B" }));
  add(el("c", { text: "C" }));
  sync();
  const before = store().elements;
  const steps = store().history.length;
  store().eraseAtPoint({ x: 0, y: 0 }, (_point, element) => element.id === "a");
  store().eraseAtPoint({ x: 0, y: 0 }, (_point, element) => element.id === "b");
  store().commitElements(store().elements, before); // pointer-up
  sync();
  assert.equal(store().history.length, steps + 1);
  assert.deepEqual(ids(server.stored), ["c"]);
  assert.deepEqual(ids(peer.elements), ["c"]);

  store().undo();
  sync();
  assert.deepEqual(store().elements.map((element) => element.text), ["A", "B", "C"]);
  assert.equal(server.stored.length, 3);
  assert.equal(peer.elements.length, 3);
});

test("a style change is one undo step, slider drags merge, and undo restores the first colour", () => {
  fresh();
  add(el("a", { strokeColor: "#111111" }));
  store().selectElement("a");
  const steps = store().history.length;
  store().setStrokeColor("#222222");
  store().setStrokeColor("#333333");
  store().setStrokeColor("#444444");
  assert.equal(store().history.length, steps + 1, "rapid changes of the same kind are one step");
  assert.equal(store().elements[0].strokeColor, "#444444");
  store().undo();
  assert.equal(store().elements[0].strokeColor, "#111111");
  store().redo();
  assert.equal(store().elements[0].strokeColor, "#444444");
});

test("the toolbar colour pattern (store setter, then setElements + commitElements) is still one step", () => {
  fresh();
  add(el("a", { strokeColor: "#111111" }));
  store().selectElement("a");
  const steps = store().history.length;
  store().setStrokeColor("#abcdef");
  const next = store().elements.map((element) => ({ ...element, strokeColor: "#abcdef" }));
  store().setElements(next);
  store().commitElements(next);
  assert.equal(store().history.length, steps + 1);
});

test("undo of a z-order change restores the order", () => {
  fresh();
  add(el("a"));
  add(el("b"));
  add(el("c"));
  store().selectElement("a");
  store().bringToFront();
  assert.deepEqual(ids(store().elements), ["b", "c", "a"]);
  store().undo();
  assert.deepEqual(ids(store().elements), ["a", "b", "c"]);
  store().redo();
  assert.deepEqual(ids(store().elements), ["b", "c", "a"]);
});

test("clear board can be undone: with restoreElements and with undo, for everyone, without duplicates", () => {
  fresh();
  add(el("a", { text: "A" }));
  add(el("b", { text: "B" }));
  sync();
  const backup = [...store().elements];

  store().clearBoard();
  // the server's clear: everything it knows becomes a tombstone
  server.stored.forEach((element) => server.deleted.add(element.id));
  server.stored = [];
  peer.receive([], ["a", "b"]);
  sync();
  assert.equal(server.stored.length, 0);

  const restored = store().restoreElements(backup);
  assert.equal(restored?.length, 2);
  sync();
  sync();
  for (const list of [store().elements, server.stored, peer.elements]) {
    assert.deepEqual(texts(list), ["A", "B"]);
  }
  assert.equal(store().restoreElements(backup), null, "restoring twice must not duplicate");

  // the same through plain undo
  fresh();
  add(el("a", { text: "A" }));
  add(el("b", { text: "B" }));
  sync();
  store().clearBoard();
  sync();
  assert.equal(server.stored.length, 0);
  store().undo();
  sync();
  assert.deepEqual(texts(server.stored), ["A", "B"]);
  assert.deepEqual(store().elements.map((element) => element.text), ["A", "B"]);
});

test("an arrow bound to a shape follows the shape's new id when the shape is restored", () => {
  fresh();
  add(el("shape"));
  add(el("arrow", { type: "arrow", startBinding: { elementId: "shape" } } as Partial<WhiteboardElement>));
  sync();
  store().selectElement("shape");
  store().deleteSelected();
  sync();
  store().undo();
  sync();
  const shape = store().elements.find((element) => element.type === "rectangle");
  const arrow = store().elements.find((element) => element.type === "arrow");
  assert.ok(shape && arrow);
  assert.notEqual(shape?.id, "shape");
  assert.equal(arrow?.startBinding?.elementId, shape?.id);
  assert.equal(server.stored.find((element) => element.type === "arrow")?.startBinding?.elementId, shape?.id);
});

test("an element a peer deleted is not resurrected by undoing my older edit of it", () => {
  fresh();
  add(el("a", { x: 0 }));
  sync();
  store().commitElements([el("a", { x: 99 })]);
  sync();
  store().mergeRemoteElements([], ["a"]); // a peer deletes it
  assert.equal(store().elements.length, 0);
  store().undo();
  assert.equal(store().elements.length, 0);
});

test("remote updates never create undo steps", () => {
  fresh();
  add(el("a"));
  const steps = store().history.length;
  store().mergeRemoteElements([el("p1")]);
  store().upsertRemoteElement(el("p2"));
  store().appendRemotePoints("p2", [{ x: 1, y: 1 }], { x: 0, y: 0, width: 1, height: 1 });
  store().mergeRemoteElements([], ["p1"]);
  assert.equal(store().history.length, steps);
  // and my next action does not claim them
  add(el("b"));
  store().undo();
  assert.deepEqual(ids(store().elements).sort(), ["a", "p2"]);
  assert.ok(!store().deletedElementIds.has("p2"));
});

test("a stale local array that misses a peer's element does not make undo delete that element", () => {
  fresh();
  add(el("a"));
  const stale = store().elements; // a component still holds this array
  store().upsertRemoteElement(el("peer"));
  store().commitElements([...stale, el("b")]); // overwrites the store without "peer"
  store().mergeRemoteElements([el("a"), el("peer")]); // the next snapshot merges it back
  store().undo();
  assert.deepEqual(ids(store().elements).sort(), ["a", "peer"]);
  assert.ok(!store().deletedElementIds.has("peer"));
});

test("text that is still being typed is undone as its own step", () => {
  fresh();
  add(el("a"));
  store().setElements([...store().elements, el("t", { type: "text", text: "hel" } as Partial<WhiteboardElement>)]);
  store().setElements(store().elements.map((element) => (element.id === "t" ? { ...element, text: "hello" } : element)));
  store().undo();
  assert.deepEqual(ids(store().elements), ["a"]);
  store().undo();
  assert.equal(store().elements.length, 0);
});

test("a new action clears redo, loadBoard clears everything", () => {
  fresh();
  add(el("a"));
  add(el("b"));
  store().undo();
  assert.equal(store().future.length, 1);
  add(el("c"));
  assert.equal(store().future.length, 0);
  assert.equal(store().redo(), null);
  store().loadBoard([el("x")], 5);
  assert.equal(store().history.length, 0);
  assert.equal(store().future.length, 0);
  assert.equal(store().undo(), null);
});

test("paste and duplicate are undoable and their undo deletes the copies for everyone", () => {
  fresh();
  add(el("a"));
  sync();
  store().selectElement("a");
  store().duplicateSelected();
  sync();
  assert.equal(server.stored.length, 2);
  store().undo();
  sync();
  assert.deepEqual(ids(server.stored), ["a"]);
  assert.deepEqual(ids(peer.elements), ["a"]);
});

test("a stale copy of a peer's growing stroke, written back during my drag, never enters my undo step", () => {
  fresh();
  add(el("mine", { x: 0 }));
  const p1 = el("peer-stroke", { type: "pencil", points: [{ x: 0, y: 0 }] } as Partial<WhiteboardElement>);
  store().upsertRemoteElement(p1);
  const staleList = store().elements; // what the canvas ref still holds
  const p2 = { ...p1, points: [...p1.points, { x: 1, y: 1 }] };
  store().upsertRemoteElement(p2); // the peer's stroke grows
  // my drag frame is computed from the stale list: "mine" gets a new object, the peer's OLD object is written back
  store().setElements(staleList.map((element) => (element.id === "mine" ? { ...element, x: 30 } : element)));
  const p3 = { ...p2, points: [...p2.points, { x: 2, y: 2 }] };
  store().upsertRemoteElement(p3);
  store().commitElements(store().elements);

  const step = store().history[store().history.length - 1];
  assert.deepEqual(step.changes.map((change) => change.id), ["mine"], "only my element is in my undo step");
  store().undo();
  assert.equal(store().elements.find((element) => element.id === "mine")?.x, 0);
  assert.equal(store().elements.find((element) => element.id === "peer-stroke")?.points.length, 3, "the peer's stroke is untouched");
});

test("redo of a delete deletes the restored copy for everyone", () => {
  fresh();
  add(el("a"));
  add(el("b"));
  sync();
  store().selectElement("b");
  store().deleteSelected();
  sync();
  store().undo();
  sync();
  assert.equal(server.stored.length, 2);
  store().redo();
  sync();
  sync();
  assert.deepEqual(ids(store().elements), ["a"]);
  assert.deepEqual(ids(server.stored), ["a"]);
  assert.deepEqual(ids(peer.elements), ["a"]);
});

test("many undo and redo rounds over add, move and delete stay consistent with the server and a peer", () => {
  fresh();
  add(el("a", { text: "A" }));
  sync();
  add(el("b", { text: "B" }));
  sync();
  store().commitElements(store().elements.map((element) => (element.text === "B" ? { ...element, x: 70 } : element)));
  sync();
  store().selectElement(store().elements.find((element) => element.text === "A")?.id ?? null);
  store().deleteSelected();
  sync();
  for (let round = 0; round < 3; round++) {
    store().undo(); sync(); // A back
    store().undo(); sync(); // B at x=0
    store().undo(); sync(); // B gone
    assert.deepEqual(texts(server.stored), ["A"]);
    assert.deepEqual(texts(peer.elements), ["A"]);
    store().redo(); sync(); // B back
    store().redo(); sync(); // B at x=70
    assert.equal(server.stored.find((element) => element.text === "B")?.x, 70);
    store().redo(); sync(); // A gone
    assert.deepEqual(texts(server.stored), ["B"]);
    assert.deepEqual(texts(peer.elements), ["B"]);
    assert.deepEqual(texts(store().elements), ["B"]);
  }
});
