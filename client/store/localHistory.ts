import type { WhiteboardElement } from "@shared/types";

/** One element as it was before and after a local action. `null` = it did not exist. */
export type ElementChange = {
  id: string;
  before: WhiteboardElement | null;
  after: WhiteboardElement | null;
  /** z-position the element had before the action (-1 = it was new). */
  index: number;
};

/** One undo step: only what the LOCAL user changed, never a whole-board snapshot. */
export type HistoryEntry = {
  changes: ElementChange[];
  orderBefore: string[] | null;
  orderAfter: string[] | null;
  kind?: string;
  at: number;
};

// ---------------------------------------------------------------------------------------------------
// Local undo / redo
//
// The board is merged, never replaced: a remote payload can only add or update, and a delete travels
// as a permanent tombstone (see shared/collab.ts and the server's mergeForStorage). A snapshot undo
// cannot work on top of that: an element it drops comes back with the next server echo, an element
// it brings back is swallowed by its own tombstone, and it would also wipe whatever other people
// drew since the snapshot.
//
// So an undo step is a list of per-element changes made by the LOCAL user:
//   - undoing "added"    -> the element is removed AND tombstoned, so it is deleted for everyone
//   - undoing "removed"  -> the element comes back under a NEW id (the old id stays tombstoned)
//   - undoing "modified" -> only the fields that action changed are put back
// Changes are collected while the user works (trackLocal) and closed into one step when an action
// commits (takeEntry). Remote updates never pass through here.
// ---------------------------------------------------------------------------------------------------
const HISTORY_LIMIT = 200;
const STYLE_MERGE_MS = 1000;

const pendingBefore = new Map<string, { before: WhiteboardElement | null; index: number }>();
let pendingOrder: string[] | null = null;
/** old id -> the id the element lives under now (it was restored by an undo/redo). */
const idAliases = new Map<string, string>();
/**
 * Every element object the store has ever held. A local edit always supplies a NEW object; when a local
 * array hands back an object from this set, the caller is only writing back a stale copy (the canvas
 * keeps its element list in a ref that can be one remote update behind). Such write-backs are not the
 * user's changes and must never become part of an undo step.
 */
const seenObjects = new WeakSet<WhiteboardElement>();

export function rememberObjects(next: WhiteboardElement[], previous: WhiteboardElement[]) {
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== previous[i]) seenObjects.add(next[i]);
  }
}

export function resetLocalHistory() {
  pendingBefore.clear();
  pendingOrder = null;
  idAliases.clear();
}

function resolveId(id: string): string {
  let current = id;
  for (let hops = 0; hops < 64; hops++) {
    const next = idAliases.get(current);
    if (!next) return current;
    current = next;
  }
  return current;
}

function newElementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "el-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function fieldEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!fieldEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((key) => fieldEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Fields (never the id) whose value differs between two versions of an element. */
function changedKeys(a: WhiteboardElement, b: WhiteboardElement): string[] {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("id");
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  return Array.from(keys).filter((key) => !fieldEqual(ra[key], rb[key]));
}

/**
 * Remembers how each element looked before the local user first touched it in the current action.
 * Runs on every pointermove, so the common case (same ids, a few new references) allocates nothing.
 */
export function trackLocal(previous: WhiteboardElement[], next: WhiteboardElement[]) {
  if (previous === next) return;
  let structural = previous.length !== next.length;
  if (!structural) {
    for (let i = 0; i < next.length; i++) {
      const before = previous[i];
      const after = next[i];
      if (before === after) continue;
      if (before.id !== after.id) {
        structural = true;
        break;
      }
      if (!pendingBefore.has(after.id) && !seenObjects.has(after)) pendingBefore.set(after.id, { before, index: i });
    }
    if (!structural) return;
  }

  // Elements were added, removed or reordered.
  if (!pendingOrder) pendingOrder = previous.map((element) => element.id);
  const previousIndex = new Map<string, number>();
  previous.forEach((element, index) => previousIndex.set(element.id, index));
  const nextIds = new Set<string>();
  for (const after of next) {
    nextIds.add(after.id);
    if (pendingBefore.has(after.id)) continue;
    const index = previousIndex.get(after.id);
    if (index === undefined) pendingBefore.set(after.id, { before: null, index: -1 });
    else if (previous[index] !== after && !seenObjects.has(after)) pendingBefore.set(after.id, { before: previous[index], index });
  }
  for (let index = 0; index < previous.length; index++) {
    const before = previous[index];
    if (!nextIds.has(before.id) && !pendingBefore.has(before.id)) pendingBefore.set(before.id, { before, index });
  }
}

/** Closes the current action into one undo step, or returns null when nothing really changed. */
export function takeEntry(committed: WhiteboardElement[], tombstones: Set<string>, kind?: string): HistoryEntry | null {
  if (pendingBefore.size === 0 && !pendingOrder) return null;
  const byId = new Map<string, WhiteboardElement>();
  for (const element of committed) byId.set(element.id, element);
  // z-position at the START of the action, so several removals in one action restore in the old order
  const startIndex = new Map<string, number>();
  (pendingOrder ?? []).forEach((id, position) => startIndex.set(id, position));

  const changes: ElementChange[] = [];
  for (const [id, { before, index }] of pendingBefore) {
    const after = byId.get(id) ?? null;
    if (!before && !after) continue; // created and dropped inside the same action
    if (!before) {
      // A tombstoned id that reappears locally is a stale copy, not something the user made.
      if (!tombstones.has(id)) changes.push({ id, before: null, after, index: -1 });
      continue;
    }
    if (!after) {
      // Only an explicit delete (which tombstones) is a removal. An element that merely went missing
      // was overwritten by a stale local array and will merge back in.
      if (tombstones.has(id)) changes.push({ id, before, after: null, index: startIndex.get(id) ?? index });
      continue;
    }
    if (before !== after && changedKeys(before, after).length > 0) changes.push({ id, before, after, index });
  }

  let orderBefore: string[] | null = null;
  let orderAfter: string[] | null = null;
  if (pendingOrder) {
    const afterIds = committed.map((element) => element.id);
    const afterSet = new Set(afterIds);
    const beforeSet = new Set(pendingOrder);
    const commonBefore = pendingOrder.filter((id) => afterSet.has(id));
    const commonAfter = afterIds.filter((id) => beforeSet.has(id));
    if (commonBefore.some((id, index) => id !== commonAfter[index])) {
      orderBefore = commonBefore;
      orderAfter = commonAfter;
    }
  }

  pendingBefore.clear();
  pendingOrder = null;
  if (changes.length === 0 && !orderBefore) return null;
  return { changes, orderBefore, orderAfter, kind, at: Date.now() };
}

export function pushEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const last = history[history.length - 1];
  // Dragging a slider fires many style changes: keep them as ONE undo step.
  if (
    last &&
    entry.kind === "style" &&
    last.kind === "style" &&
    entry.at - last.at < STYLE_MERGE_MS &&
    last.changes.length === entry.changes.length &&
    last.changes.every((change, index) => change.id === entry.changes[index].id)
  ) {
    const merged: HistoryEntry = {
      ...entry,
      changes: entry.changes.map((change, index) => ({ ...change, before: last.changes[index].before }))
    };
    return [...history.slice(0, -1), merged];
  }
  const next = [...history, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function fixBindings(element: WhiteboardElement): WhiteboardElement {
  const start = element.startBinding ? resolveId(element.startBinding.elementId) : null;
  const end = element.endBinding ? resolveId(element.endBinding.elementId) : null;
  const startMoved = element.startBinding && start !== element.startBinding.elementId;
  const endMoved = element.endBinding && end !== element.endBinding.elementId;
  if (!startMoved && !endMoved) return element;
  return {
    ...element,
    ...(startMoved ? { startBinding: { ...element.startBinding, elementId: start as string } } : {}),
    ...(endMoved ? { endBinding: { ...element.endBinding, elementId: end as string } } : {})
  };
}

/** Puts the listed ids into the given relative order, inside the slots they occupy now. */
function reorderLike(elements: WhiteboardElement[], order: string[]): WhiteboardElement[] {
  const rank = new Map<string, number>();
  order.forEach((id, index) => rank.set(resolveId(id), index));
  const slots: number[] = [];
  const picked: WhiteboardElement[] = [];
  elements.forEach((element, index) => {
    if (rank.has(element.id)) {
      slots.push(index);
      picked.push(element);
    }
  });
  picked.sort((a, b) => (rank.get(a.id) as number) - (rank.get(b.id) as number));
  const out = elements.slice();
  slots.forEach((slot, index) => {
    out[slot] = picked[index];
  });
  return out;
}

/** Applies one undo step backwards ("undo") or forwards ("redo") to the CURRENT board. */
export function applyEntry(
  elements: WhiteboardElement[],
  tombstones: Set<string>,
  entry: HistoryEntry,
  direction: "undo" | "redo"
): { elements: WhiteboardElement[]; tombstones: Set<string> } {
  let next = elements.slice();
  const nextTombstones = new Set(tombstones);
  const restored: { element: WhiteboardElement; index: number }[] = [];
  let aliased = false;

  for (const change of entry.changes) {
    const id = resolveId(change.id);
    const from = direction === "undo" ? change.after : change.before;
    const to = direction === "undo" ? change.before : change.after;
    const at = next.findIndex((element) => element.id === id);

    if (!to) {
      // The element has to go, for everyone: remove it and leave a tombstone.
      if (at !== -1) next.splice(at, 1);
      nextTombstones.add(id);
      continue;
    }
    if (!from) {
      // The element has to come back. Its old id is tombstoned on the server and on every peer, so
      // it returns as a new element.
      if (at !== -1 && !nextTombstones.has(id)) continue;
      const freshId = newElementId();
      idAliases.set(id, freshId);
      aliased = true;
      restored.push({ element: { ...to, id: freshId }, index: direction === "undo" ? change.index : -1 });
      continue;
    }
    // Modified: put back only the fields this action changed. Somebody else's later edits to other
    // fields stay, and an element a peer deleted meanwhile is not resurrected.
    if (at === -1) continue;
    const keys = changedKeys(from, to);
    if (keys.length === 0) continue;
    const patched = { ...next[at] } as unknown as Record<string, unknown>;
    const target = to as unknown as Record<string, unknown>;
    for (const key of keys) {
      if (key in target) patched[key] = target[key];
      else delete patched[key];
    }
    next[at] = patched as unknown as WhiteboardElement;
  }

  restored.sort((a, b) => a.index - b.index);
  for (const { element, index } of restored) {
    const position = index < 0 ? next.length : Math.min(index, next.length);
    next.splice(position, 0, element);
  }
  if (aliased || idAliases.size > 0) next = next.map(fixBindings);

  const order = direction === "undo" ? entry.orderBefore : entry.orderAfter;
  if (order) next = reorderLike(next, order);
  return { elements: next, tombstones: nextTombstones };
}

/**
 * Elements to put back on the board (for example after "clear board"): each returns under a NEW id,
 * because its old id is tombstoned for everyone. Returns the next element list, or null when every
 * element is already back.
 */
export function restoreUnderNewIds(
  current: WhiteboardElement[],
  tombstones: Set<string>,
  elements: WhiteboardElement[]
): WhiteboardElement[] | null {
  const present = new Set(current.map((element) => element.id));
  const clones: WhiteboardElement[] = [];
  for (const element of elements) {
    const id = resolveId(element.id);
    if (present.has(id) && !tombstones.has(id)) continue; // already back on the board
    const freshId = newElementId();
    idAliases.set(id, freshId);
    clones.push({ ...element, id: freshId });
  }
  if (clones.length === 0) return null;
  return [...current, ...clones].map(fixBindings);
}
