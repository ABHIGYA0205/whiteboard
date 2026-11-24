import test from "node:test";
import assert from "node:assert/strict";
import { useBoardStore } from "@/store/boardStore";
import type { WhiteboardElement } from "@shared/types";

const el = (id: string, x = 0): WhiteboardElement =>
  ({ id, type: "rectangle", x, y: 0, width: 10, height: 10, strokeColor: "#fff", strokeWidth: 2, points: [] } as WhiteboardElement);

const reset = () => useBoardStore.getState().loadBoard([], 0);
const ids = () => useBoardStore.getState().elements.map((e) => e.id).sort();

test("REGRESSION: server snapshot after reconnect must not wipe my unsaved shapes", () => {
  reset();
  // I draw two shapes; only the first has reached the server yet.
  useBoardStore.getState().commitElements([el("saved")]);
  useBoardStore.getState().commitElements([el("saved"), el("in-flight")]);

  // Socket reconnects -> board:state arrives with a stale snapshot.
  useBoardStore.getState().syncElements([el("saved")], 3);

  assert.deepEqual(ids(), ["in-flight", "saved"], "both my shapes must survive");
});

test("REGRESSION: a peer's replace-elements snapshot must not delete my newest stroke", async () => {
  reset();
  useBoardStore.getState().commitElements([el("peer-shape")]);
  useBoardStore.getState().commitElements([el("peer-shape"), el("my-stroke")]);

  // Peer drags a shape -> emits their whole board, which predates my stroke.
  await new Promise((resolve) => setTimeout(resolve, 700)); // past the edit grace window
  useBoardStore.getState().mergeRemoteElements([el("peer-shape", 80)]);

  assert.deepEqual(ids(), ["my-stroke", "peer-shape"], "my stroke must survive");
  assert.equal(useBoardStore.getState().elements.find((e) => e.id === "peer-shape")?.x, 80);
});

test("a shape I am actively dragging is not reverted by a peer snapshot", () => {
  reset();
  useBoardStore.getState().commitElements([el("mine", 0)]);
  useBoardStore.getState().setActiveElementIds(["mine"]);

  useBoardStore.getState().mergeRemoteElements([el("mine", 900)]); // peer's stale copy

  assert.equal(useBoardStore.getState().elements[0].x, 0, "in-flight shape wins");
  useBoardStore.getState().setActiveElementIds([]);
});

test("a peer's delete still propagates through tombstones", () => {
  reset();
  useBoardStore.getState().commitElements([el("a"), el("b")]);
  useBoardStore.getState().mergeRemoteElements([el("a")], ["b"]);
  assert.deepEqual(ids(), ["a"]);
});

test("remote clear is tombstoned so old elements cannot merge back in", () => {
  reset();
  useBoardStore.getState().commitElements([el("a"), el("b")]);
  useBoardStore.getState().applyRemoteClear();
  assert.deepEqual(ids(), []);
  useBoardStore.getState().mergeRemoteElements([el("a"), el("b")]);
  assert.deepEqual(ids(), [], "already-cleared elements must stay cleared");
});

test("undo restores a deleted element under a new id and the old id stays deleted", () => {
  reset();
  useBoardStore.getState().commitElements([el("a")]);
  useBoardStore.getState().commitElements([el("a"), el("b", 7)]);
  useBoardStore.getState().selectElement("b");
  useBoardStore.getState().deleteSelected();
  assert.deepEqual(ids(), ["a"]);
  useBoardStore.getState().undo();
  const restored = useBoardStore.getState().elements.find((e) => e.id !== "a");
  assert.equal(useBoardStore.getState().elements.length, 2);
  assert.equal(restored?.x, 7);
  assert.notEqual(restored?.id, "b", "the server and every peer have tombstoned the old id for good");
  // A late copy of the OLD id is still swallowed by its tombstone; the restored element is unaffected.
  useBoardStore.getState().mergeRemoteElements([el("b", 42)]);
  assert.equal(useBoardStore.getState().elements.length, 2);
  assert.ok(!ids().includes("b"));
});

test("autosave tracks local edits only and keeps a newer edit while an older request completes", () => {
  const state = useBoardStore.getState;
  state().loadBoard([el("own"), el("peer")]);
  state().upsertRemoteElement(el("peer", 10));
  assert.equal(state().pendingLocalChanges.size, 0);

  state().setElements([el("own", 20), state().elements[1]]);
  const sent = state().pendingLocalChanges;
  state().setElements([el("own", 30), state().elements[1]]);
  state().acknowledgeLocalChanges(sent);
  assert.deepEqual([...state().pendingLocalChanges.keys()], ["own"]);
  assert.equal(state().pendingLocalChanges.get("own")?.x, 30);
});

test("a delayed autosave response cannot undo the latest committed version of an element", () => {
  const state = useBoardStore.getState;
  state().loadBoard([el("shared")]);
  state().setElements([el("shared", 10)]);
  const sent = state().pendingLocalChanges;
  state().mergeRemoteElements([el("shared", 30)], [], 3, "committed");
  state().mergeRemoteElements([el("shared", 10)], [], 2, "committed");
  state().acknowledgeLocalChanges(sent);
  assert.equal(state().elements[0].x, 30);
  assert.equal(state().version, 3);
  assert.equal(state().pendingLocalChanges.size, 0);
});

test("explicit remote deletions remove pending updates and never become local saves", () => {
  const state = useBoardStore.getState;
  state().loadBoard([el("shared")], 1);
  state().setElements([el("shared", 10)]);
  state().mergeRemoteElements([], ["shared"], 2, "committed");
  assert.equal(state().elements.length, 0);
  assert.equal(state().pendingLocalChanges.size, 0);
  assert.ok(state().deletedElementIds.has("shared"));
});
