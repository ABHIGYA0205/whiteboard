import type { WhiteboardElement } from "./types";

// ---------------------------------------------------------------------------------------------------
// Layer order that survives collaboration
//
// The board is merged element by element (see collab.ts): a merge keeps the local array order, so
// the position of an element inside the array cannot be the source of truth for its layer. Nobody
// else would ever learn that an element moved, and the next client that re-sends its board would
// put the old order back into storage.
//
// A layer change therefore writes a number, `z`, on the elements, and every client arranges its
// array by those numbers:
//   - elements WITH a number are sorted ascending among the array slots they occupy; equal numbers
//     are ordered by id, so every client arrives at the same order
//   - an element WITHOUT a number keeps the slot it has. A board on which nobody ever changed a
//     layer carries no numbers at all and behaves exactly as before; a new element is appended, so
//     it is on top.
// ---------------------------------------------------------------------------------------------------

/** The layer number of an element, or null when it has none. */
export function layerOf(element: WhiteboardElement): number | null {
  const z = element.z;
  return typeof z === "number" && Number.isFinite(z) ? z : null;
}

function compareLayer(a: WhiteboardElement, b: WhiteboardElement): number {
  const difference = (a.z as number) - (b.z as number);
  if (difference !== 0) return difference;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Arranges the array by layer number. Returns the SAME array when it is already in order, which is
 * the normal case: this runs on every remote update, so that path only reads.
 */
export function sortByLayer(elements: WhiteboardElement[]): WhiteboardElement[] {
  let previous: WhiteboardElement | null = null;
  let inOrder = true;
  for (const element of elements) {
    if (layerOf(element) === null) continue;
    if (previous && compareLayer(previous, element) > 0) {
      inOrder = false;
      break;
    }
    previous = element;
  }
  if (inOrder) return elements;

  const slots: number[] = [];
  const numbered: WhiteboardElement[] = [];
  elements.forEach((element, index) => {
    if (layerOf(element) !== null) {
      slots.push(index);
      numbered.push(element);
    }
  });
  numbered.sort(compareLayer);
  const out = elements.slice();
  slots.forEach((slot, index) => {
    out[slot] = numbered[index];
  });
  return out;
}

/**
 * Marks the longest run of values that ascends strictly (null is never part of it). What is not
 * marked is the smallest set of entries that has to move to bring the whole list into order.
 */
export function longestAscending(values: Array<number | null>): boolean[] {
  const count = values.length;
  const tails: number[] = []; // tails[k] = index of the value that ends the best run of length k + 1
  const cameFrom: number[] = new Array(count).fill(-1);
  for (let index = 0; index < count; index++) {
    const value = values[index];
    if (value === null) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((values[tails[middle]] as number) < value) low = middle + 1;
      else high = middle;
    }
    cameFrom[index] = low > 0 ? tails[low - 1] : -1;
    tails[low] = index;
  }
  const keep: boolean[] = new Array(count).fill(false);
  for (let index = tails.length > 0 ? tails[tails.length - 1] : -1; index !== -1; index = cameFrom[index]) {
    keep[index] = true;
  }
  return keep;
}

/**
 * Writes layer numbers so that the given array order is the order every client sorts to.
 * Every element ends up with a number, and as few elements as possible change: the ones whose
 * numbers already ascend are kept, the others get numbers between their neighbours. `moved` names
 * the elements the user moved: they are the ones that get new numbers, so an element nobody touched
 * is not rewritten (it may be under somebody else's pointer at this moment). Returns the same array
 * when nothing has to change; changed elements are new objects.
 */
export function withLayerNumbers(elements: WhiteboardElement[], moved?: ReadonlySet<string>): WhiteboardElement[] {
  const count = elements.length;
  if (count === 0) return elements;
  const keep = longestAscending(elements.map((element) => (moved && moved.has(element.id) ? null : layerOf(element))));
  const numbers: number[] = new Array(count);

  let index = 0;
  while (index < count) {
    if (keep[index]) {
      numbers[index] = layerOf(elements[index]) as number;
      index++;
      continue;
    }
    let end = index;
    while (end < count && !keep[end]) end++;
    // elements[index .. end) need numbers, between the kept neighbours on either side
    const lower = index > 0 ? numbers[index - 1] : null;
    const upper = end < count ? (layerOf(elements[end]) as number) : null;
    const size = end - index;
    for (let k = 0; k < size; k++) {
      if (lower === null && upper === null) numbers[index + k] = k;
      else if (lower === null) numbers[index + k] = (upper as number) - (size - k);
      else if (upper === null) numbers[index + k] = lower + k + 1;
      else numbers[index + k] = lower + ((upper - lower) * (k + 1)) / (size + 1);
    }
    index = end;
  }

  // Two neighbours can run out of room between them after very many single steps. Start over then.
  let usable = true;
  for (let k = 0; k < count; k++) {
    if (!Number.isFinite(numbers[k]) || (k > 0 && !(numbers[k] > numbers[k - 1]))) {
      usable = false;
      break;
    }
  }
  if (!usable) {
    for (let k = 0; k < count; k++) numbers[k] = k;
  }

  let changed = false;
  const out = elements.map((element, k) => {
    if (element.z === numbers[k]) return element;
    changed = true;
    return { ...element, z: numbers[k] };
  });
  return changed ? out : elements;
}

/** A copy without a layer number: a pasted or duplicated element is new, so it belongs on top. */
export function withoutLayer(element: WhiteboardElement): WhiteboardElement {
  if (element.z === undefined) return element;
  const copy = { ...element };
  delete copy.z;
  return copy;
}
