/**
 * When the UrgAns transcript offers a way back to the newest message (2026-10-20).
 *
 * The transcript scrolls under a frosted composer, so a reader who scrolled up
 * to reread an earlier answer has no edge telling them how far the latest reply
 * is. A small down-arrow sits above the composer while they are far enough up
 * that the bottom is out of reach, and goes away as soon as they are back near
 * it. Pure, so the one number that decides "far enough" lives here and is
 * tested, and so the button can never show on a transcript that does not
 * scroll at all.
 */

/** How far above the bottom of the transcript counts as "scrolled up". Two
 *  or three lines of a reply, not one: one line back and the arrow would
 *  flicker on every bounce of a touch scroll. */
export const SCROLL_TO_LATEST_THRESHOLD_PX = 200;

/** How far the transcript scrolls under the composer's frosted ground (px).
 *  The bottom sentinel is this tall, so a message scrolled to the end still
 *  clears the frost. Keep it equal to the composer wrapper's negative top
 *  margin in ChappiConversation (-mt-4). It was 40 until 2026-11-10, when the
 *  founder cut the frost to about the height of the box. */
export const COMPOSER_OVERLAP_PX = 16;

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** Pixels of transcript still below the viewport's bottom edge. Never negative:
 *  iOS overscroll can report a scrollTop past the end. */
export function distanceFromLatest(metrics: ScrollMetrics): number {
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return 0;
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

/** True when the reader is far enough up that the newest message is out of
 *  reach. A transcript shorter than the threshold can never answer true, which
 *  is what keeps the arrow off a conversation of two turns. */
export function isAwayFromLatest(
  metrics: ScrollMetrics,
  threshold: number = SCROLL_TO_LATEST_THRESHOLD_PX
): boolean {
  return distanceFromLatest(metrics) > threshold;
}
