// How long a toast stays up, by how much it matters.
//
// A confirmation ("Saved") can go quickly: the thing it reports is already
// visible. A failure cannot: it is the only place the person learns that
// something did not happen, and it is gone in the time it takes to read half
// of it. Reading speed is the floor, not the time to finish the sentence and
// decide what to do about it, so errors and warnings stay up longer.
export type ToastTone = 'success' | 'error' | 'warning';

export function toastDismissMs(tone: ToastTone, message: string): number {
  const base = tone === 'error' ? 8000 : tone === 'warning' ? 6000 : 4000;
  // A long message needs longer to read: ~1s per 20 characters past a short
  // one, capped so a paragraph cannot pin itself to the screen.
  const extra = Math.max(0, message.length - 60) * 50;
  return Math.min(base + extra, 15000);
}
