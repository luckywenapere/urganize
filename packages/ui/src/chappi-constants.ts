/**
 * Chappi's fixed values, deliberately NOT inside Chappi.tsx.
 *
 * That file carries `'use client'` (it needs `useId` for the shadow filter),
 * and a client module's exports reach a Server Component as opaque client
 * references rather than as values — so a server-rendered page importing
 * CHAPPI_POSES from it gets a proxy it cannot map over. Splitting the plain
 * data out keeps it readable from both sides. The `/admin/chappi` preview page
 * is exactly that case, and it broke the first time this was tried.
 *
 * Every value here is copied from the Chappi character model sheet
 * (`chappi-model-sheet-v1.html`, Draft 01, Aug 2026).
 */

export const CHAPPI_POSES = [
  'idle',
  'pointing',
  'thinking',
  'celebrating',
  'carrying',
  'resting',
] as const;

export type ChappiPose = (typeof CHAPPI_POSES)[number];

/**
 * Four values, flat. Ink, cream and spring are the only colours that ever
 * touch him; forest is for the surface BEHIND him and never on him.
 */
export const CHAPPI_COLORS = {
  ink: '#0D120E',
  cream: '#F5F0E6',
  spring: '#7FD99A',
  forest: '#14643A',
} as const;

/**
 * The sheet's stage, verbatim — what goes behind him on a dark surface so his
 * ink hood separates from the background. Goes on the CONTAINER as a
 * `background`, never on the character. Note it is a dark green wash rather
 * than flat forest: forest at full strength behind an ink hood is louder than
 * the sheet's own stage and fights the outline it is meant to reveal.
 */
export const CHAPPI_GLOW =
  'radial-gradient(120% 90% at 50% 28%, #1c2a20 0%, #0F160F 62%, #0B100C 100%)';

/** "Smallest legible size: 64 px wide" — the sheet. `size` is clamped up to it. */
export const CHAPPI_MIN_SIZE = 64;

/**
 * The sheet draws the six poses in `viewBox="66 60 268 330"` and the hero in
 * `"60 55 280 350"`. Neither contains every pose: the pose box crops the
 * shadow's blur, and BOTH crop pointing's raised hand, which reaches x≈357.
 * So this is the sheet's pose box with the hero's lower edge (405, which is
 * where the author let the shadow end), and the component sets
 * `overflow: visible` to carry the one pose that exceeds it. Every pose shares
 * this box deliberately — swapping one for another must not resize him or
 * shift the layout around him, which a per-pose box would do.
 */
export const CHAPPI_VIEW_BOX = { x: 66, y: 60, width: 268, height: 345 } as const;
