// A touch that starts this close to the left screen edge belongs to the OS
// back-swipe, so the pager must not also start a page turn from it.
export const SWIPE_EDGE_GUARD_PX = 20;

export function isEdgeStart(clientX: number, edgePx: number = SWIPE_EDGE_GUARD_PX): boolean {
  return clientX < edgePx;
}
