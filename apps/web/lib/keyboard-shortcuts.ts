/**
 * Keyboard shortcuts (URG-92, 2026-10-15). Desktop only, never while typing.
 *
 *  - ⌘K / Ctrl+K   search and commands (components/shell/CommandBar.tsx)
 *  - C             new activity (components/tasks/TaskUIProvider.tsx)
 *  - G then a key  go to a top-bar area (components/shell/KeyboardShortcuts.tsx)
 *  - /             put the cursor in UrgAns
 *  - Esc           close what is open (each dialog handles its own)
 *
 * There is no shortcuts panel (the `?` panel was removed by founder call,
 * 2026-07-23). People learn the go-to keys from the Pages rows in ⌘K, which
 * show each one on the right. Pure logic lives here so it can be tested.
 */

/** Second key after G, to the top-bar area it opens (lib/shell-nav.ts keys). */
export const GO_KEYS: Record<string, string> = {
  h: 'home',
  u: 'urgans',
  c: 'catalogue',
  r: 'relationships',
  o: 'opportunities',
};

/** How long after G the second key still counts. */
export const GO_SEQUENCE_MS = 1200;

export type KeyLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

/** A bare key press: no ⌘, Ctrl or Alt, so ⌘C still copies. Shift is allowed. */
export function isBareKey(event: KeyLike): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}

export type GoDecision =
  | { kind: 'start' }
  | { kind: 'go'; area: string }
  | { kind: 'cancel' }
  | { kind: 'ignore' };

/**
 * What a key press does to the G sequence. `pendingSince` is when G was
 * pressed, or null. `areas` are the area keys this person can see.
 */
export function decideGoKey(
  event: KeyLike,
  pendingSince: number | null,
  now: number,
  areas: readonly string[]
): GoDecision {
  if (!isBareKey(event)) return pendingSince === null ? { kind: 'ignore' } : { kind: 'cancel' };
  const key = event.key.toLowerCase();
  const pending = pendingSince !== null && now - pendingSince <= GO_SEQUENCE_MS;
  if (pending) {
    const area = GO_KEYS[key];
    if (area && areas.includes(area)) return { kind: 'go', area };
    return { kind: 'cancel' };
  }
  if (key === 'g') return { kind: 'start' };
  return pendingSince === null ? { kind: 'ignore' } : { kind: 'cancel' };
}

/** The hint shown beside an area in ⌘K ("G H"), or null when it has none. */
export function goHintForArea(area: string): string | null {
  const entry = Object.entries(GO_KEYS).find(([, value]) => value === area);
  return entry ? `G ${entry[0].toUpperCase()}` : null;
}
