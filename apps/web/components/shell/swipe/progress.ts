'use client';

// The pager's position, in pages (0 = Artists, 1 = UrgAns, 2 = Team, and every
// fraction between while a finger or the spring is moving). Published outside
// React so the tab underline can follow it every frame without re-rendering
// the tab row: the same spring drives the pages and the underline.

type Listener = (progress: number) => void;

let current = 0;
const listeners = new Set<Listener>();

export function setSwipeProgress(progress: number): void {
  current = progress;
  for (const listener of listeners) listener(progress);
}

export function getSwipeProgress(): number {
  return current;
}

export function subscribeSwipeProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
