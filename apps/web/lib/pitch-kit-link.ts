// Pure helpers for the kit link a pitch carries (2026-10-16). No React, no
// network, so vitest can hold them.

/** The line a pitch note carries so the kit goes with it. */
export const kitNoteLine = (url: string): string => `Kit: ${url}`;

/**
 * The note as sent: what the manager wrote, then the kit link on its own line.
 * The link is dropped rather than the words when the two do not fit the cap.
 */
export function noteWithKit(note: string, kitUrl: string | null, max: number): string {
  const words = note.trim();
  if (!kitUrl) return words.slice(0, max);
  const line = kitNoteLine(kitUrl);
  const joined = words ? `${words}\n\n${line}` : line;
  return joined.length <= max ? joined : words.slice(0, max);
}

/** How much room the manager's own words have once the kit line is in. */
export function noteRoom(kitUrl: string | null, max: number): number {
  if (!kitUrl) return max;
  return Math.max(0, max - kitNoteLine(kitUrl).length - 2);
}

/** Slugs are at most 60 characters and release ids are uuids, so this is the
 *  longest a kit link can be. Used to keep room for one not minted yet. */
export function longestKitUrl(origin: string): string {
  return `${origin}/k/${'x'.repeat(60)}?r=${'0'.repeat(36)}`;
}
