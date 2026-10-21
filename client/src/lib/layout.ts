// How far to slide a box left so it fits inside an area: just enough to stop it sticking out
// past the right edge, but never so far that it sticks out past the left edge.
export function slideToFit(box: { left: number; right: number }, area: { left: number; right: number }): number {
  return Math.max(0, Math.min(box.right - area.right, box.left - area.left));
}
