// Moving character tabs around. Plain functions on lists of ids; the list itself is never changed.

// Moves `moved` to where `target` is (dragging one tab onto another): the tabs in between shift
// over by one. Unknown ids change nothing.
export function moveTo(ids: number[], moved: number, target: number): number[] {
  const to = ids.indexOf(target);
  if (!ids.includes(moved) || to === -1) return ids;
  const rest = ids.filter((id) => id !== moved);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}

// Moves `moved` one place left (-1) or right (+1); at either end it stays put (Alt + arrow keys).
export const moveBy = (ids: number[], moved: number, step: -1 | 1): number[] => moveTo(ids, moved, ids[ids.indexOf(moved) + step] ?? moved);

export const sameOrder = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);
