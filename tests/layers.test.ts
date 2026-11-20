import test from "node:test";
import assert from "node:assert/strict";
import { useBoardStore } from "@/store/boardStore";
import { mergeElementLists, sameElement } from "@shared/collab";
import { layerOf, longestAscending, sortByLayer, withLayerNumbers, withoutLayer } from "@shared/layers";
import type { WhiteboardElement } from "@shared/types";
import { applyBoardOps, createBoard, deleteBoard, getBoard, updateBoard } from "../server/src/services/board.service";

// ---------------------------------------------------------------------------------------------------
// Layer order ("bring to front", "send to back", one step up or down) must reach the other users at
// once, survive storage, and survive another user re-sending the board. The rest of the system is
// modelled with its real rules:
//  - the server keeps a union of what it was sent; a full board puts the SENDER's array order first
//    (server/src/services/board.service.ts: mergeForStorage)
//  - a peer applies what it receives with the shared merge, which keeps the peer's own array order
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
const el = (id: string, extra: Partial<WhiteboardElement> = {}): WhiteboardElement =>
  ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, strokeColor: "#fff", strokeWidth: 2, points: [], ...extra } as WhiteboardElement);
const ids = (list: WhiteboardElement[]) => list.map((element) => element.id).join("");
const numbers = (list: WhiteboardElement[]) => list.map((element) => element.z);
const allNumbered = (list: WhiteboardElement[]) => list.every((element) => layerOf(element) !== null);

let server: FakeServer;
let peer: FakePeer;
function fresh(start: WhiteboardElement[] = []) {
  store().loadBoard(start, 0);
  useBoardStore.setState({ tool: "select" });
  server = new FakeServer();
  peer = new FakePeer();
  if (start.length > 0) {
    server.receive(start);
    peer.receive(start);
  }
}
/** What the app does after a layer change, an undo or a redo: emit the whole board. */
function emitBoard() {
  const { elements, deletedElementIds } = store();
  peer.receive(elements, deletedElementIds);
  const answer = server.receive(elements, deletedElementIds);
  store().mergeRemoteElements(answer.elements, answer.deletedIds);
}
/** The board as somebody who opens it now gets it. */
function freshLoad(stored: WhiteboardElement[] = server.stored): WhiteboardElement[] {
  return mergeElementLists({ local: [], incoming: stored }).elements;
}
const graceOver = () => useBoardStore.setState({ localEditTimes: new Map() });
const add = (element: WhiteboardElement) => store().commitElements([...store().elements, element]);
const abcd = () => [el("a"), el("b"), el("c"), el("d")];

// ------------------------------------------------------------------------------------- the helpers

test("sortByLayer: a board without layer numbers is returned untouched (the same array)", () => {
  const board = abcd();
  assert.equal(sortByLayer(board), board);
  const numbered = [el("a", { z: 0 }), el("b", { z: 1 }), el("c"), el("d", { z: 2 })];
  assert.equal(sortByLayer(numbered), numbered, "already in order: nothing is copied");
});

test("sortByLayer: numbered elements are sorted among their slots, unnumbered ones keep their slot, ties go by id", () => {
  const board = [el("a", { z: 5 }), el("n1"), el("b", { z: 1 }), el("c", { z: 3 }), el("n2")];
  assert.deepEqual(sortByLayer(board).map((e) => e.id), ["b", "n1", "c", "a", "n2"]);

  const tieOne = [el("y", { z: 1 }), el("x", { z: 1 }), el("w", { z: 0 })];
  const tieTwo = [el("w", { z: 0 }), el("x", { z: 1 }), el("y", { z: 1 })];
  assert.deepEqual(sortByLayer(tieOne).map((e) => e.id), ["w", "x", "y"]);
  assert.deepEqual(sortByLayer(tieTwo).map((e) => e.id), ["w", "x", "y"], "every client arrives at the same order");
});

test("longestAscending marks the largest set that is already in order", () => {
  assert.deepEqual(longestAscending([0, 1, 5, 2, 3]), [true, true, false, true, true]);
  assert.deepEqual(longestAscending([null, 2, null, 3]), [false, true, false, true]);
  assert.deepEqual(longestAscending([1, 1, 1]).filter(Boolean).length, 1, "equal values do not ascend");
  assert.deepEqual(longestAscending([]), []);
});

test("withLayerNumbers: the first layer change numbers every element in the given order", () => {
  const out = withLayerNumbers(abcd());
  assert.deepEqual(numbers(out), [0, 1, 2, 3]);
  assert.equal(withLayerNumbers(out), out, "nothing to change the second time");
});

test("withLayerNumbers: moving one element changes exactly one element", () => {
  const base = withLayerNumbers(abcd()); // a0 b1 c2 d3
  const [a, b, c, d] = base;
  const changedIds = (next: WhiteboardElement[]) => next.filter((e) => !base.includes(e)).map((e) => e.id);

  const front = withLayerNumbers([b, c, d, a]);
  assert.deepEqual(changedIds(front), ["a"]);
  assert.deepEqual(numbers(front), [1, 2, 3, 4]);

  const back = withLayerNumbers([d, a, b, c]);
  assert.deepEqual(changedIds(back), ["d"]);
  assert.deepEqual(numbers(back), [-1, 0, 1, 2]);

  const step = withLayerNumbers([a, c, b, d]);
  assert.equal(changedIds(step).length, 1, "one step up or down rewrites one number");
  assert.deepEqual(sortByLayer([step[3], step[1], step[0], step[2]]).map((e) => e.id), ["a", "c", "b", "d"]);
});

test("withLayerNumbers: new elements without a number get one, in their place", () => {
  const [a, b] = withLayerNumbers([el("a"), el("b")]);
  const wanted = [b, el("n1"), el("n2"), a]; // a brought to the front, above two new elements
  for (const out of [withLayerNumbers(wanted), withLayerNumbers(wanted, new Set(["a"]))]) {
    assert.deepEqual(out.map((e) => e.id), ["b", "n1", "n2", "a"]);
    assert.ok(allNumbered(out));
    assert.deepEqual(sortByLayer([out[3], out[2], out[1], out[0]]).map((e) => e.id), ["b", "n1", "n2", "a"]);
  }
});

test("withLayerNumbers: told what the user moved, it rewrites that element and not its neighbour", () => {
  const base = withLayerNumbers(abcd()); // a0 b1 c2 d3
  const [a, b, c, d] = base;
  // one step: b and c swap. Either number could be rewritten; it must be the one the user moved.
  const movedB = withLayerNumbers([a, c, b, d], new Set(["b"]));
  assert.deepEqual(movedB.filter((e) => !base.includes(e)).map((e) => e.id), ["b"]);
  assert.deepEqual(numbers(movedB), [0, 2, 2.5, 3]);
  const movedC = withLayerNumbers([a, c, b, d], new Set(["c"]));
  assert.deepEqual(movedC.filter((e) => !base.includes(e)).map((e) => e.id), ["c"]);
  assert.deepEqual(numbers(movedC), [0, 0.5, 1, 3]);
});

test("withLayerNumbers: equal numbers written by two users at once are told apart again", () => {
  const out = withLayerNumbers([el("a", { z: 0 }), el("x", { z: 7 }), el("y", { z: 7 }), el("b", { z: 9 })]);
  assert.ok(numbers(out).every((z, index, all) => index === 0 || (z as number) > (all[index - 1] as number)));
  assert.deepEqual(out.map((e) => e.id), ["a", "x", "y", "b"]);
});

test("withLayerNumbers: thousands of single steps into the same gap never lose the order", () => {
  let board = withLayerNumbers([el("a"), el("b"), el("c")]);
  for (let round = 0; round < 1500; round++) {
    // take the top element and put it directly above the bottom one: the gap above "a" halves every time
    const top = board[board.length - 1];
    const wanted = [board[0], top, ...board.slice(1, -1)];
    board = withLayerNumbers(wanted);
    assert.ok(numbers(board).every((z) => Number.isFinite(z)), `round ${round}: numbers stay finite`);
    const scrambled = [...board].reverse();
    assert.deepEqual(sortByLayer(scrambled).map((e) => e.id), wanted.map((e) => e.id), `round ${round}`);
  }
});

test("withoutLayer drops the number and leaves an element without one alone", () => {
  const plain = el("a");
  assert.equal(withoutLayer(plain), plain);
  const copy = withoutLayer(el("b", { z: 3, text: "t" }));
  assert.equal("z" in copy, false);
  assert.equal(copy.text, "t");
});

// --------------------------------------------------------------------------------------- the merge

test("sameElement tells two versions apart when only the layer number differs", () => {
  assert.equal(sameElement(el("a", { z: 1 }), el("a", { z: 2 })), false);
  assert.equal(sameElement(el("a"), el("a", { z: 0 })), false);
  assert.equal(sameElement(el("a", { z: 2 }), el("a", { z: 2 })), true);
});

test("merge: a peer's layer numbers rearrange the local array, whatever order they arrive in", () => {
  const local = abcd();
  const incoming = [el("d", { z: 3 }), el("c", { z: 2 }), el("a", { z: 4 }), el("b", { z: 1 })];
  const merged = mergeElementLists({ local, incoming });
  assert.equal(ids(merged.elements), "bcda");
  assert.equal(merged.changed, true);
});

test("merge: a board without layer numbers keeps the local order exactly as before", () => {
  const local = abcd();
  const merged = mergeElementLists({ local, incoming: [el("d"), el("c"), el("b"), el("a"), el("e")] });
  assert.equal(ids(merged.elements), "abcde");
  assert.ok(merged.elements.every((element) => element.z === undefined));
});

test("merge: the element under my pointer keeps its slot while the others follow the peer", () => {
  const local = abcd();
  const incoming = [el("a", { z: 3 }), el("b", { z: 0 }), el("c", { z: 1 }), el("d", { z: 2 })];
  const merged = mergeElementLists({ local, incoming, activeElementIds: ["c"] });
  // c is being dragged: its incoming copy is skipped, so it has no number and stays in the third slot
  assert.equal(ids(merged.elements), "bdca");
  assert.equal(merged.elements[2].z, undefined);
});

// --------------------------------------------------------------------------------------- the store

test("the four layer actions give the right order and write it into the elements", () => {
  fresh(abcd());
  store().selectElement("a");
  assert.equal(ids(store().bringToFront() as WhiteboardElement[]), "bcda");
  assert.ok(allNumbered(store().elements), "the first layer change numbers the whole board");
  assert.deepEqual(numbers(store().elements), [1, 2, 3, 4], "b, c and d keep the number of their old place; only a is new");

  store().selectElement("d");
  assert.equal(ids(store().sendToBack() as WhiteboardElement[]), "dbca");
  store().selectElement("d");
  assert.equal(ids(store().bringForward() as WhiteboardElement[]), "bdca");
  store().selectElement("a");
  assert.equal(ids(store().sendBackward() as WhiteboardElement[]), "bdac");
  assert.equal(ids(sortByLayer([...store().elements].reverse())), "bdac", "the numbers alone give the order");

  store().selectElement(["b", "c"]);
  assert.equal(ids(store().bringToFront() as WhiteboardElement[]), "dabc");
  assert.equal(ids(sortByLayer([...store().elements].reverse())), "dabc");
});

test("two users who make the first layer change at the same moment write the same numbers on what neither moved", () => {
  const board = () => [el("a"), el("x"), el("b"), el("y"), el("c")];
  const numberOf = (list: WhiteboardElement[]) => Object.fromEntries(list.map((element) => [element.id, element.z]));

  fresh(board());
  store().selectElement("x");
  const mine = numberOf(store().bringToFront() as WhiteboardElement[]);
  fresh(board()); // the other user, on the same board, before either change arrived
  store().selectElement("y");
  const theirs = numberOf(store().sendToBack() as WhiteboardElement[]);

  assert.deepEqual(mine, { a: 0, b: 2, y: 3, c: 4, x: 5 });
  assert.deepEqual(theirs, { y: -1, a: 0, x: 1, b: 2, c: 4 });
  for (const id of ["a", "b", "c"]) assert.equal(mine[id], theirs[id], `${id} was moved by nobody`);
});

test("a layer action that changes nothing writes nothing and sends nothing", () => {
  fresh(abcd());
  store().selectElement("d");
  assert.equal(store().bringToFront(), null, "already on top");
  assert.equal(store().bringForward(), null);
  store().selectElement("a");
  assert.equal(store().sendToBack(), null, "already at the bottom");
  assert.equal(store().sendBackward(), null);
  assert.ok(store().elements.every((element) => element.z === undefined), "no numbers were written");
  assert.equal(store().history.length, 0);
});

test("a layer change reaches the other user at once, without a reload", () => {
  fresh(abcd());
  store().selectElement("d");
  store().sendToBack();
  emitBoard();
  assert.equal(ids(store().elements), "dabc");
  assert.equal(ids(peer.elements), "dabc", "the peer keeps its own array order in a merge, so only the numbers can move d");
});

test("a layer change survives storage, even when the stored array is in another order", () => {
  fresh(abcd());
  store().selectElement("a");
  store().bringToFront();
  emitBoard();
  assert.equal(ids(freshLoad()), "bcda");
  assert.equal(ids(freshLoad([...server.stored].reverse())), "bcda");
  store().loadBoard([...server.stored].reverse(), 1);
  assert.equal(ids(store().elements), "bcda", "loadBoard arranges by number");
});

test("a user who re-sends the whole board cannot put the old layer order back", () => {
  fresh(abcd());
  store().selectElement("d");
  store().sendToBack();
  emitBoard();
  // The peer changes a colour and re-sends its board, as every style change, undo or redo does.
  peer.elements = peer.elements.map((element) => (element.id === "b" ? { ...element, strokeColor: "#f00" } : element));
  const answer = server.receive(peer.elements);
  graceOver();
  store().mergeRemoteElements(answer.elements, answer.deletedIds);
  assert.equal(ids(store().elements), "dabc");
  assert.equal(ids(freshLoad()), "dabc");
  assert.equal(store().elements.find((element) => element.id === "b")?.strokeColor, "#f00");
});

test("a user who missed the layer change gets it with the next board state", () => {
  fresh(abcd());
  const late = new FakePeer();
  late.receive(abcd());
  store().selectElement("b");
  store().bringToFront();
  emitBoard(); // `late` was offline and saw nothing
  assert.equal(ids(late.elements), "abcd");
  late.receive(server.stored); // reconnect: the server sends the board
  assert.equal(ids(late.elements), "acdb");
});

test("undo and redo of a layer change are seen by everyone", () => {
  fresh(abcd());
  store().selectElement("a");
  store().bringToFront();
  emitBoard();
  assert.equal(ids(peer.elements), "bcda");

  store().undo();
  emitBoard();
  assert.equal(ids(store().elements), "abcd");
  assert.equal(ids(peer.elements), "abcd", "undo writes the old order as numbers, so the peer follows");
  assert.equal(ids(freshLoad()), "abcd");

  store().redo();
  emitBoard();
  assert.equal(ids(store().elements), "bcda");
  assert.equal(ids(peer.elements), "bcda");
  assert.equal(ids(freshLoad()), "bcda");
});

test("a layer change is one undo step that holds an order, not element edits, and its undo rewrites only what moved", () => {
  fresh(withLayerNumbers(abcd()));
  store().selectElement("a");
  store().bringToFront();
  assert.equal(store().history.length, 1);
  const entry = store().history[0];
  assert.equal(entry.kind, "layer");
  assert.deepEqual(entry.changes, [], "the layer number is not an edit of the element");
  assert.deepEqual(entry.orderBefore, ["a", "b", "c", "d"]);
  assert.deepEqual(entry.orderAfter, ["b", "c", "d", "a"]);

  const before = store().elements;
  store().undo();
  assert.equal(ids(store().elements), "abcd");
  assert.deepEqual(store().elements.filter((element) => !before.includes(element)).map((element) => element.id), ["a"]);
});

test("undo of my layer change keeps a layer change somebody else made afterwards", () => {
  fresh(abcd());
  store().selectElement("a");
  store().bringToFront(); // b c d a
  emitBoard();
  // the peer sends d to the back: d b c a
  const peerBoard = withLayerNumbers([peer.elements[2], peer.elements[0], peer.elements[1], peer.elements[3]]);
  graceOver();
  store().mergeRemoteElements(peerBoard);
  assert.equal(ids(store().elements), "dbca");

  store().undo(); // only a goes back: it was the bottom element
  assert.equal(ids(store().elements), "adbc");
  assert.equal(ids(sortByLayer([...store().elements].reverse())), "adbc");
});

test("a new element is on top for everyone after a layer change, and the next layer change numbers it", () => {
  fresh(abcd());
  store().selectElement("d");
  store().sendToBack();
  emitBoard();
  add(el("n"));
  assert.equal(store().elements[store().elements.length - 1].id, "n");
  assert.equal(store().elements[store().elements.length - 1].z, undefined, "a new element carries no number");
  emitBoard();
  assert.equal(ids(peer.elements), "dabcn");

  store().selectElement("n");
  store().sendBackward();
  emitBoard();
  assert.equal(ids(store().elements), "dabnc");
  assert.equal(ids(peer.elements), "dabnc");
  assert.ok(allNumbered(store().elements));
});

test("pasted and duplicated elements are new: no layer number, on top", () => {
  fresh(abcd());
  store().selectElement("a");
  store().bringToFront(); // b c d a, all numbered
  store().selectElement("b");
  const duplicated = store().duplicateSelected() as WhiteboardElement[];
  assert.equal(duplicated[duplicated.length - 1].z, undefined);
  assert.equal(duplicated.length, 5);
  store().selectElement("c");
  store().copySelected();
  const pasted = store().paste() as WhiteboardElement[];
  assert.equal(pasted[pasted.length - 1].z, undefined);
  assert.equal(pasted.length, 6);
  emitBoard();
  assert.deepEqual(peer.elements.map((element) => element.id), store().elements.map((element) => element.id));
});

test("an element that is deleted and brought back by undo returns to its old layer for everyone", () => {
  fresh(abcd());
  store().selectElement("a");
  store().bringToFront(); // b c d a
  emitBoard();
  store().selectElement("c");
  store().deleteSelected();
  emitBoard();
  assert.equal(ids(peer.elements), "bda");

  store().undo();
  emitBoard();
  const position = (list: WhiteboardElement[]) => list.findIndex((element) => !["a", "b", "d"].includes(element.id));
  assert.equal(position(store().elements), 1, "back between b and d");
  assert.equal(position(peer.elements), 1, "also for the peer, who received it as a new element");
});

test("a peer's layer change that arrives while I draw is not recorded as my change", () => {
  fresh(abcd());
  const mine = el("mine");
  store().setElements([...store().elements, mine]); // pointer down: my new shape
  // the peer brings a to the front in the meantime
  store().mergeRemoteElements(withLayerNumbers([el("b"), el("c"), el("d"), el("a")]));
  assert.equal(ids(store().elements.filter((element) => element.id !== "mine")), "bcda");
  store().commitElements(store().elements.map((element) => (element.id === "mine" ? { ...element, width: 50 } : element)));

  const entry = store().history[store().history.length - 1];
  assert.equal(entry.orderBefore, null, "drawing a shape is not a layer change");
  store().undo();
  assert.equal(ids(store().elements), "bcda", "undo removes my shape and leaves the peer's order alone");
});

test("a single remote element update with a new layer number rearranges the array", () => {
  fresh(withLayerNumbers(abcd()));
  store().upsertRemoteElement(el("a", { z: 2.5 }));
  assert.equal(ids(store().elements), "bcad");
  store().upsertRemoteElement(el("e", { z: -1 }));
  assert.equal(ids(store().elements), "ebcad");
  store().upsertRemoteElement(el("f"));
  assert.equal(ids(store().elements), "ebcadf", "a new element without a number goes on top");
});

test("a board on which nobody ever changed a layer never gets layer numbers", () => {
  fresh(abcd());
  add(el("e"));
  store().upsertRemoteElement(el("f"));
  store().mergeRemoteElements([el("g"), el("a", { x: 5 })]);
  graceOver();
  emitBoard();
  store().selectElement("e");
  store().deleteSelected();
  store().undo();
  emitBoard();
  assert.ok(store().elements.every((element) => element.z === undefined));
  assert.ok(server.stored.every((element) => element.z === undefined));
  assert.ok(peer.elements.every((element) => element.z === undefined));
});

test("two users change layers, add elements and undo in a long random sequence: every screen and the storage always agree", () => {
  let seed = 20261116;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const someIds = (list: WhiteboardElement[]) => list.filter(() => random() < 0.3).map((element) => element.id);

  fresh([el("s0"), el("s1"), el("s2")]);
  let created = 0;
  const done: Record<string, number> = { add: 0, peerAdd: 0, layer: 0, peerLayer: 0, undo: 0, redo: 0 };
  /** The peer does what the store does for a layer change: new array order, then the numbers for it. */
  const peerLayerChange = () => {
    const chosen = new Set(someIds(peer.elements));
    if (chosen.size === 0) return;
    const moving = peer.elements.filter((element) => chosen.has(element.id));
    const rest = peer.elements.filter((element) => !chosen.has(element.id));
    const at = Math.floor(random() * (rest.length + 1));
    const wanted = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    if (ids(wanted) === ids(peer.elements)) return;
    done.peerLayer++;
    const inPlace = new Map(withLayerNumbers(peer.elements).map((element) => [element.id, element]));
    peer.elements = withLayerNumbers(wanted.map((element) => inPlace.get(element.id) as WhiteboardElement), chosen);
  };
  const peerSends = () => {
    const answer = server.receive(peer.elements, peer.tombstones);
    graceOver();
    store().mergeRemoteElements(peer.elements, Array.from(peer.tombstones));
    peer.receive(answer.elements, answer.deletedIds);
  };

  for (let step = 0; step < 600; step++) {
    const action = pick(["add", "add", "peerAdd", "layer", "layer", "layer", "peerLayer", "peerLayer", "undo", "redo"]);
    if (action === "add") {
      add(el(`a${created++}`));
      done.add++;
      emitBoard();
    } else if (action === "peerAdd") {
      peer.elements = [...peer.elements, el(`p${created++}`)];
      done.peerAdd++;
      peerSends();
    } else if (action === "layer") {
      const chosen = someIds(store().elements);
      if (chosen.length === 0) continue;
      store().selectElement(chosen);
      const result = pick([store().bringForward, store().sendBackward, store().bringToFront, store().sendToBack])();
      if (result) {
        done.layer++;
        emitBoard();
      }
    } else if (action === "peerLayer") {
      peerLayerChange();
      peerSends();
    } else {
      const result = action === "undo" ? store().undo() : store().redo();
      if (result) {
        done[action]++;
        emitBoard();
      }
    }
    graceOver();

    const mine = ids(store().elements);
    assert.equal(ids(peer.elements), mine, `step ${step} (${action}): the other user sees another order`);
    const shuffled = [...server.stored].sort(() => random() - 0.5);
    assert.equal(ids(freshLoad(shuffled).filter((element) => layerOf(element) !== null)), ids(store().elements.filter((element) => layerOf(element) !== null)), `step ${step} (${action}): a fresh load orders the numbered elements differently`);
    assert.equal(ids(freshLoad()), mine, `step ${step} (${action}): a fresh load gives another order`);
  }
  // The sequence must really have exercised every kind of action, or the test proves nothing.
  for (const [kind, least] of Object.entries({ add: 60, peerAdd: 30, layer: 80, peerLayer: 60, undo: 30, redo: 10 })) {
    assert.ok(done[kind] >= least, `only ${done[kind]} effective "${kind}" actions (want at least ${least})`);
  }
  assert.ok(store().elements.every((element) => layerOf(element) !== null) || store().elements.length > 0);
});

// -------------------------------------------------------------------------------------- the server

test("the server stores the layer number and returns it, after a full save and after a delta save", async () => {
  const board = await createBoard();
  await updateBoard(board.id, [el("a", { z: 2 }), el("b")]);
  let loaded = await getBoard(board.id);
  assert.equal(loaded?.elements.find((element) => element.id === "a")?.z, 2);
  assert.equal("z" in (loaded?.elements.find((element) => element.id === "b") as object), false, "no number is invented");

  await applyBoardOps(board.id, [{ op: "update", element: el("b", { z: -0.5 }) }]);
  loaded = await getBoard(board.id);
  assert.equal(loaded?.elements.find((element) => element.id === "b")?.z, -0.5);
  assert.equal(loaded?.elements.find((element) => element.id === "a")?.z, 2);
  await deleteBoard(board.id);
});
