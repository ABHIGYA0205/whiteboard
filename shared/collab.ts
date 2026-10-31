import type { WhiteboardElement } from "./types";

/**
 * Conflict-free merge for collaborative boards.
 *
 * Rule of the land: a remote payload may only ever ADD or UPDATE elements.
 * It must never be able to DELETE something it doesn't know about, because the
 * sender's snapshot is always partial — it doesn't contain the stroke you are
 * drawing right now, or the shape you drew 200 ms ago that hasn't been
 * broadcast/persisted yet. Deleting is only allowed through an explicit
 * tombstone (deletedIds), i.e. somebody actually pressed delete/erase/clear.
 *
 * Both the live socket path and the autosave 409 path go through here so the
 * behaviour cannot drift apart again.
 */


/**
 * Cheap structural equality for elements. Avoids JSON.stringify on every element
 * of every incoming snapshot (which is O(points) per element and shows up as lag
 * on large boards). Covers every persisted field; strokes are compared by point
 * count + endpoints, which is enough because a partial stroke is always re-sent
 * with more points on the next event.
 */
function sameElement(a: WhiteboardElement, b: WhiteboardElement): boolean {
  if (a === b) return true;
  if (
    a.type !== b.type ||
    a.x !== b.x ||
    a.y !== b.y ||
    a.width !== b.width ||
    a.height !== b.height ||
    a.strokeColor !== b.strokeColor ||
    a.strokeWidth !== b.strokeWidth ||
    a.strokeStyle !== b.strokeStyle ||
    a.fillColor !== b.fillColor ||
    a.fillStyle !== b.fillStyle ||
    a.roughness !== b.roughness ||
    a.roundness !== b.roundness ||
    a.opacity !== b.opacity ||
    a.text !== b.text ||
    a.fontSize !== b.fontSize ||
    a.imageUrl !== b.imageUrl ||
    a.isLocked !== b.isLocked
  ) {
    return false;
  }

  if ((a.startBinding?.elementId ?? null) !== (b.startBinding?.elementId ?? null)) return false;
  if ((a.endBinding?.elementId ?? null) !== (b.endBinding?.elementId ?? null)) return false;

  const ap = a.points ?? [];
  const bp = b.points ?? [];
  if (ap.length !== bp.length) return false;
  if (ap.length > 0) {
    const afl = ap[0], bfl = bp[0];
    const alp = ap[ap.length - 1], blp = bp[bp.length - 1];
    if (afl.x !== bfl.x || afl.y !== bfl.y || alp.x !== blp.x || alp.y !== blp.y) return false;
  }
  return true;
}

export type MergeInput = {
  /** Current local element list (source of truth for "don't lose my work"). */
  local: WhiteboardElement[];
  /** Elements received from a peer / the server snapshot. Treated as upserts. */
  incoming: WhiteboardElement[];
  /** Ids explicitly deleted by a peer (tombstones). */
  deletedIds?: Iterable<string>;
  /** Ids this client already knows are deleted locally. */
  localTombstones?: Iterable<string>;
  /** id -> timestamp of the last local edit, used to keep in-flight edits on top. */
  localEditTimes?: Map<string, number>;
  /** Element currently being edited by the local user (always wins). */
  editingElementId?: string | null;
  /** Elements currently under the local pointer (drawing/dragging). Always win. */
  activeElementIds?: Iterable<string>;
  /** Grace window (ms) in which a local edit beats an incoming copy of the same id. */
  graceMs?: number;
  /** Clock injection for tests. */
  now?: number;
};

export type MergeResult = {
  elements: WhiteboardElement[];
  /** True when the merge changed anything (used to decide whether to re-save). */
  changed: boolean;
  /** Ids that must be treated as deleted locally from now on. */
  tombstones: Set<string>;
};

const DEFAULT_GRACE_MS = 4000;

export function mergeElementLists({
  local,
  incoming,
  deletedIds,
  localTombstones,
  localEditTimes,
  editingElementId,
  activeElementIds,
  graceMs = DEFAULT_GRACE_MS,
  now = Date.now()
}: MergeInput): MergeResult {
  const tombstones = new Set<string>(localTombstones ?? []);
  for (const id of deletedIds ?? []) tombstones.add(id);

  const activeIds = new Set<string>(activeElementIds ?? []);
  const byId = new Map<string, WhiteboardElement>();
  const order: string[] = [];

  // Local state first, so its z-order is preserved.
  for (const element of local) {
    if (tombstones.has(element.id)) continue;
    byId.set(element.id, element);
    order.push(element.id);
  }

  let changed = false;

  for (const remote of incoming) {
    if (!remote || typeof remote.id !== "string") continue;
    if (tombstones.has(remote.id)) continue;

    const existing = byId.get(remote.id);
    if (!existing) {
      byId.set(remote.id, remote);
      order.push(remote.id);
      changed = true;
      continue;
    }

    // Never yank an element the local user is actively drawing/dragging/typing in.
    if (activeIds.has(remote.id)) continue;
    if (editingElementId && editingElementId === remote.id) continue;

    const lastLocalEdit = localEditTimes?.get(remote.id) ?? 0;
    if (now - lastLocalEdit < graceMs) continue;

    if (!sameElement(existing, remote)) {
      byId.set(remote.id, remote);
      changed = true;
    }
  }

  // Drop anything that got tombstoned by a peer mid-merge.
  for (const id of tombstones) {
    if (byId.has(id)) {
      byId.delete(id);
      changed = true;
    }
  }

  const elements = order
    .filter((id) => byId.has(id))
    .map((id) => byId.get(id) as WhiteboardElement);

  return { elements, changed, tombstones };
}
