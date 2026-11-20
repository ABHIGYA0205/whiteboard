import test from "node:test";
import assert from "node:assert/strict";
import { useBoardStore } from "@/store/boardStore";
import { mergeElementLists } from "@shared/collab";
import type { WhiteboardElement } from "@shared/types";

// ---------------------------------------------------------------------------------------------------
// A text box that ends up empty is removed. Every keystroke was already sent to the other users, so
// the removal has to be a real delete (with a tombstone): otherwise an invisible empty box stays on
// every other screen and in storage, and from there it also comes back to the user who removed it.
// The canvas calls removeElements for this; the rest of the system is modelled with its real rules.
// ---------------------------------------------------------------------------------------------------
class FakeServer {
  stored: WhiteboardElement[] = [];
  deleted = new Set<string>();
  receive(elements: WhiteboardElement[], deletedIds: Iterable<string> = []) {
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
  receive(elements: WhiteboardElement[], deletedIds: Iterable<string> = []) {
    const merged = mergeElementLists({ local: this.elements, incoming: elements, deletedIds, localTombstones: this.tombstones });
    this.elements = merged.elements;
    this.tombstones = merged.tombstones;
  }
}

const store = () => useBoardStore.getState();
const textBox = (id: string, text: string): WhiteboardElement =>
  ({ id, type: "text", x: 10, y: 10, width: 100, height: 24, strokeColor: "#fff", strokeWidth: 2, text, points: [] } as WhiteboardElement);
const texts = (list: WhiteboardElement[]) => list.filter((element) => element.type === "text").map((element) => element.text);

let server: FakeServer;
let peer: FakePeer;
function fresh() {
  store().loadBoard([], 0);
  useBoardStore.setState({ tool: "select" });
  server = new FakeServer();
  peer = new FakePeer();
}
/** A single live element update, as every keystroke sends it. */
function emitElement(element: WhiteboardElement) {
  peer.receive([element]);
  server.receive([element]);
}
/** The whole board, as the canvas sends it after removing the box. */
function emitBoard() {
  const { elements, deletedElementIds } = store();
  peer.receive(elements, deletedElementIds);
  const answer = server.receive(elements, deletedElementIds);
  store().mergeRemoteElements(answer.elements, answer.deletedIds);
}
/** Typing: the canvas writes the new text into the store without closing an undo step. */
function type(id: string, text: string) {
  const next = store().elements.map((element) => (element.id === id ? { ...element, text } : element));
  store().setElements(next);
  emitElement(next.find((element) => element.id === id) as WhiteboardElement);
}

test("a text box that is created and left empty is deleted for everyone and leaves no undo step", () => {
  fresh();
  const box = textBox("t1", "");
  store().setElements([...store().elements, box]); // the text tool: the box exists while it is edited
  emitElement(box);
  assert.deepEqual(texts(peer.elements), [""], "the other user sees the empty box while it is edited");

  const next = store().removeElements(["t1"]); // clicked away without typing
  assert.deepEqual(next, []);
  assert.ok(store().deletedElementIds.has("t1"), "the delete must leave a tombstone");
  emitBoard();
  emitBoard(); // a second echo must not bring it back
  assert.deepEqual(texts(store().elements), []);
  assert.deepEqual(texts(peer.elements), [], "no invisible box on the other screen");
  assert.deepEqual(texts(server.stored), [], "and none in storage");
  assert.equal(store().history.length, 0, "nothing happened that could be undone");
});

test("a text that is emptied later is deleted for everyone, and undo brings it back with its words", () => {
  fresh();
  const box = textBox("t1", "");
  store().setElements([...store().elements, box]);
  emitElement(box);
  type("t1", "hello");
  store().commitElements(store().elements); // clicked away: the text stays
  emitBoard();
  assert.deepEqual(texts(peer.elements), ["hello"]);

  type("t1", "hell");
  type("t1", "");
  assert.deepEqual(texts(peer.elements), [""], "the other user follows the typing");
  const next = store().removeElements(["t1"]);
  assert.deepEqual(next, []);
  emitBoard();
  emitBoard();
  assert.deepEqual(texts(store().elements), []);
  assert.deepEqual(texts(peer.elements), []);
  assert.deepEqual(texts(server.stored), []);

  const restored = store().undo() as WhiteboardElement[];
  assert.deepEqual(texts(restored), ["hello"], "undo restores the text as it was before it was emptied");
  assert.notEqual(restored[0].id, "t1", "under a new id: the old one is deleted for everyone");
  emitBoard();
  assert.deepEqual(texts(peer.elements), ["hello"]);
  assert.deepEqual(texts(server.stored), ["hello"]);
});

test("removeElements also deletes an element this screen no longer holds, and keeps the rest selected", () => {
  fresh();
  const keep = textBox("keep", "stay");
  store().commitElements([keep]);
  store().selectElement(["keep", "gone"]);
  const next = store().removeElements(["gone"]) as WhiteboardElement[];
  assert.deepEqual(texts(next), ["stay"]);
  assert.ok(store().deletedElementIds.has("gone"), "the tombstone still travels to the others");
  assert.deepEqual(store().selectedElementIds, ["keep"]);
  assert.equal(store().removeElements([]), null);
});
